// The firebomb: grab the oil sack, douse the lantern, draw back (hold Q), throw.
// The lantern bursts into a pool of burning oil that lights the area and burns
// shadows. The iron lantern survives; walk into the flames to take it back.
import * as THREE from 'three';
import { GAME } from '../core/GameConfig.js';
import { shared } from '../renderer/SharedUniforms.js';
import { LAYERS } from '../renderer/Layers.js';
import { createWorldMaterial, createFlameMaterial, createFireMaterial } from '../renderer/Materials.js';
import { buildBody, buildPosts } from '../player/Lantern.js';

const POOL_SLOT = 7; // beacon light slot used by the burning pool
const PRIME_TIME = 0.55;
const CHARGE_TIME = 1.0;
const GUIDE_N = 34;

const guideVert = `
uniform float uPxScale;
attribute float aK;
varying float vK;
void main() {
  vK = aK;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  // trail dots stay small even right in front of the camera
  gl_PointSize = aK > 0.99 ? clamp(0.5 * uPxScale / max(-mv.z, 0.1), 6.0, 60.0) : clamp(0.05 * uPxScale / max(-mv.z, 0.1), 2.0, 7.0);
  gl_Position = projectionMatrix * mv;
}`;
const guideFrag = `
uniform vec3 uEmber;  // final (sRGB) palette colours: this is drawn after the print pass
uniform vec3 uCream;
varying float vK;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float ring = vK > 0.99 ? smoothstep(0.65, 0.75, r) * (1.0 - smoothstep(0.9, 1.0, r)) : 1.0 - smoothstep(0.6, 1.0, r);
  if (ring <= 0.01) discard;
  // normal blending: dots overlapping along the line of sight must not add up into bloom
  gl_FragColor = vec4(mix(uEmber, uCream, vK), ring * (vK > 0.99 ? 1.0 : 0.85));
}`;

export class Firebomb {
  constructor(scene, world, events, interactions, economy, lantern) {
    this.scene = scene;
    this.world = world;
    this.events = events;
    this.economy = economy;
    this.lantern = lantern;
    this.state = 'idle'; // idle | priming | charging | flying | landed
    this.t = 0;
    this.charge = 0;
    this.pools = [];
    this.enabled = false;

    // thrown lantern prop
    const mat = createWorldMaterial();
    this.prop = new THREE.Group();
    this.prop.add(new THREE.Mesh(buildBody(), mat), new THREE.Mesh(buildPosts(), mat));
    this.propFlameMat = createFlameMaterial();
    const fg = new THREE.PlaneGeometry(0.05, 0.11);
    fg.translate(0, 0.055, 0);
    this.propFlame = new THREE.Mesh(fg, this.propFlameMat);
    this.propFlame.position.set(0, -0.238, 0);
    this.propFlame.layers.set(LAYERS.FX);
    this.propFlame.frustumCulled = false;
    this.prop.add(this.propFlame);
    this.prop.traverse((o) => { if (o !== this.propFlame) o.layers.set(LAYERS.WORLD); });
    this.prop.visible = false;
    scene.add(this.prop);
    this.lightPos = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();

    // arc guide
    const g = new THREE.BufferGeometry();
    this.guidePos = new Float32Array(GUIDE_N * 3);
    const ks = new Float32Array(GUIDE_N);
    ks[GUIDE_N - 1] = 1;
    for (let k = 0; k < GUIDE_N - 1; k++) ks[k] = k / (GUIDE_N - 1) * 0.6;
    g.setAttribute('position', new THREE.BufferAttribute(this.guidePos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aK', new THREE.BufferAttribute(ks, 1));
    this.guide = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uPxScale: shared.uPxScale, uEmber: { value: new THREE.Vector3(1.0, 0.541, 0.122) }, uCream: { value: new THREE.Vector3(1.0, 0.886, 0.69) } },
      vertexShader: guideVert, fragmentShader: guideFrag, transparent: true, depthWrite: false,
    }));
    this.guide.frustumCulled = false;
    this.guide.visible = false; // drawn on the 2D aim canvas instead (ui/AimOverlay.js)
    this.guideCount = 0;

    // pool fire visuals: a ring of flames + rising tongues
    this.poolFlames = [];
    for (let k = 0; k < 9; k++) {
      const m = createFlameMaterial();
      m.uniforms.uFlameGain.value = 0.12; // many big flames: keep each one dim so they don't bloom together
      const pg = new THREE.PlaneGeometry(0.8, 1.7);
      pg.translate(0, 0.85, 0);
      const f = new THREE.Mesh(pg, m);
      f.layers.set(LAYERS.FX);
      f.frustumCulled = false;
      f.visible = false;
      scene.add(f);
      this.poolFlames.push({ mesh: f, mat: m, a: Math.random() * 6.28, r: Math.random(), s: 0.6 + Math.random() * 0.7 });
    }
    this.sparks = [];
    this.sparkPos = new Float32Array(200 * 3);
    this.sparkAge = new Float32Array(200);
    this.sparkSeed = new Float32Array(200);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aAge', new THREE.BufferAttribute(this.sparkAge, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(this.sparkSeed, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setDrawRange(0, 0);
    this.sparkPoints = new THREE.Points(sg, createFireMaterial());
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.layers.set(LAYERS.FX);
    scene.add(this.sparkPoints);

    const it = interactions.add({
      x: 0, z: 0, radius: 1.7, hold: 0.35, priority: 2,
      label: () => 'Hold  E  to take back the lantern',
      enabled: () => this.state === 'landed',
      onComplete: () => this.pickup(),
    });
    Object.defineProperty(it, 'x', { get: () => this.pos.x });
    Object.defineProperty(it, 'z', { get: () => this.pos.z });
  }

  get radius() {
    return GAME.throwRadius;
  }

  get priming() {
    return this.state === 'priming' || this.state === 'charging';
  }

  _launch(cam) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const p = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(right, 0.15).add(new THREE.Vector3(0, -0.2, 0)).addScaledVector(fwd, 0.4);
    const speed = THREE.MathUtils.lerp(6, 15, this.charge);
    const v = fwd.clone().multiplyScalar(speed);
    v.y += 2.2;
    return { p, v };
  }

  _step(p, v, dt) {
    v.y -= 9.81 * dt;
    p.addScaledVector(v, dt);
    const dg = this.world.dungeon;
    if (!dg.isFloorAt(p.x, p.z)) return 'wall';
    const floor = this.world.surfaceHeight(p.x, p.z);
    if (p.y <= floor + 0.05) { p.y = floor + 0.05; return 'floor'; }
    const ceil = this.world.ceilingAt(p.x, p.z);
    if (p.y > ceil - 0.2) { v.y = -Math.abs(v.y) * 0.3; p.y = ceil - 0.2; }
    return null;
  }

  pickup() {
    this.prop.visible = false;
    this.lantern.thrown = null;
    this.state = 'idle';
    this.events.emit('lanternRetrieved', {});
  }

  update(dt, t, player, game, camera) {
    const L = this.lantern;
    const playing = game.state === 'playing' && !game.paused;
    const wants = playing && player.throwHeld && this.enabled;

    if (this.state === 'idle' && wants && L.inHand && !L.burnout && L.stow < 0.3) {
      if (this.economy.sack >= GAME.throwCost) {
        this.state = 'priming';
        this.t = 0;
        this.events.emit('throwPrime', {});
      } else if (!this._warned) {
        this._warned = true;
        this.events.emit('notEnoughOil', {});
      }
    }
    if (!player.throwHeld) this._warned = false;

    if (this.state === 'priming') {
      this.t += dt;
      if (!wants) this.state = 'idle';
      else if (this.t >= PRIME_TIME) { this.state = 'charging'; this.charge = 0; }
    } else if (this.state === 'charging') {
      this.charge = Math.min(1, this.charge + dt / CHARGE_TIME);
      // arc guide
      const { p, v } = this._launch(camera);
      let n = 0;
      for (let s = 0; s < 120 && n < GUIDE_N - 1; s++) {
        const hit = this._step(p, v, 0.035);
        if (s % 2 === 0 && s > 6) { this.guidePos.set([p.x, p.y, p.z], n * 3); n++; }
        if (hit) break;
      }
      // unused dots go under the floor (stacked additive dots would bloom into a blob)
      for (let k = n; k < GUIDE_N - 1; k++) this.guidePos.set([p.x, -50, p.z], k * 3);
      this.guidePos.set([p.x, Math.max(p.y, 0.03), p.z], (GUIDE_N - 1) * 3);
      this.guideCount = n;
      this.guide.geometry.attributes.position.needsUpdate = true;
      if (!wants) {
        // release: throw
        if (this.economy.spend(GAME.throwCost)) {
          const l = this._launch(camera);
          this.pos.copy(l.p);
          this.vel.copy(l.v);
          this.state = 'flying';
          L.thrown = { lightPos: this.lightPos };
          this.prop.visible = true;
          this.events.emit('throw', {});
        } else this.state = 'idle';
      }
    }
    this.guide.visible = this.state === 'charging';

    if (this.state === 'flying') {
      let hit = null;
      for (let k = 0; k < 3 && !hit; k++) hit = this._step(this.pos, this.vel, dt / 3);
      this.prop.position.copy(this.pos);
      this.prop.rotation.x += dt * 9;
      this.prop.rotation.z += dt * 4;
      if (hit) this._explode();
    }
    if (this.state === 'flying' || this.state === 'landed') {
      this.prop.updateMatrixWorld(true);
      this.propFlame.getWorldPosition(this.lightPos);
      if (this.state === 'landed') this.lightPos.y = Math.max(this.lightPos.y, this.pos.y + 0.25);
      this.propFlameMat.uniforms.uFlicker.value = 0.6 + 0.4 * Math.random();
    }

    // burning pools
    let lit = 0;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i];
      pl.t += dt;
      const life = 1 - pl.t / pl.dur;
      if (life <= 0) { this.pools.splice(i, 1); continue; }
      pl.level = Math.min(1, pl.t * 4) * Math.min(1, life * 3);
      lit = Math.max(lit, pl.level);
      shared.uBeaconPos.value[POOL_SLOT].set(pl.x, 0.9, pl.z, pl.level * 1.8 * (0.85 + 0.3 * Math.random()));
      shared.uBeaconBox.value[POOL_SLOT].set(pl.x - pl.r * 3.5, pl.z - pl.r * 3.5, pl.x + pl.r * 3.5, pl.z + pl.r * 3.5);
      for (let s = 0; s < dt * 45; s++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * pl.r;
        this.sparks.push({ x: pl.x + Math.cos(a) * r, y: 0.05, z: pl.z + Math.sin(a) * r, vy: 1.2 + Math.random() * 1.6, a: 0, life: 0.5 + Math.random() * 0.5, s: Math.random() });
      }
    }
    if (!this.pools.length) shared.uBeaconPos.value[POOL_SLOT].set(0, 0, 0, 0);
    const pl = this.pools[0];
    for (const f of this.poolFlames) {
      f.mesh.visible = !!pl;
      if (!pl) continue;
      const rr = (0.35 + 0.65 * Math.sqrt(f.r)) * pl.r * 0.85; // ring of fire, the lantern in the clear middle
      f.mesh.position.set(pl.x + Math.cos(f.a) * rr, 0.0, pl.z + Math.sin(f.a) * rr);
      f.mesh.scale.setScalar(f.s * pl.level * (0.8 + 0.4 * Math.sin(t * 7 + f.a * 3)));
      f.mat.uniforms.uFlicker.value = 0.6 + 0.4 * Math.sin(t * 11 + f.a * 5);
    }
    let n = 0;
    for (let k = this.sparks.length - 1; k >= 0; k--) {
      const q = this.sparks[k];
      q.a += dt / q.life;
      if (q.a >= 1) { this.sparks.splice(k, 1); continue; }
      q.y += q.vy * dt;
    }
    for (const q of this.sparks.slice(-200)) {
      this.sparkPos.set([q.x, q.y, q.z], n * 3); this.sparkAge[n] = q.a; this.sparkSeed[n] = q.s; n++;
    }
    const sg = this.sparkPoints.geometry;
    sg.setDrawRange(0, n);
    sg.attributes.position.needsUpdate = sg.attributes.aAge.needsUpdate = sg.attributes.aSeed.needsUpdate = true;
  }

  _explode() {
    this.state = 'landed';
    const p = this.pos;
    this.prop.rotation.set(Math.PI / 2 - 0.3, Math.random() * 6, 0); // lies on its side
    this.prop.position.set(p.x, this.world.surfaceHeight(p.x, p.z) + 0.07, p.z);
    this.pools.push({ x: p.x, z: p.z, r: GAME.throwRadius, t: 0, dur: GAME.throwBurn, level: 0 });
    this.events.emit('fireExplosion', { x: p.x, y: p.y, z: p.z, r: GAME.throwRadius });
  }
}
