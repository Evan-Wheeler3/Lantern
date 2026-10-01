// The held lantern: viewmodel geometry, the organic flame flicker, pendulum sway,
// shutters that close for the focused beam — and it DRIVES the one light in the world
// (writes position / intensity / range / cone into the shared uniforms).
import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { valueNoise3 } from '../core/noise.js';
import { shared, paletteLinear } from '../renderer/SharedUniforms.js';
import { createWorldMaterial, createFlameMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { finalize, merge, limb, mat } from '../world/geo.js';
import { GAME } from '../core/GameConfig.js';

const IRON = { tone: 0.68, gloss: 0.85 };
const BRASS = { tone: 0.85, gloss: 0.9 };
const LEATHER = { tone: 0.3, gloss: 0.2 };

const n1 = (t, seed) => valueNoise3(t, seed * 13.1, 0.5, 3);

function setLayers(obj, ...layers) {
  obj.traverse((o) => {
    o.layers.disableAll();
    for (const l of layers) o.layers.enable(l);
  });
}

function buildBody() {
  const P = [];
  const add = (g, o = IRON) => P.push(finalize(g, o));
  // bail handle (arched over the cap)
  add(new THREE.TorusGeometry(0.05, 0.0055, 6, 20, Math.PI).applyMatrix4(mat([0, -0.05, 0])));
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.008, 6, 5).applyMatrix4(mat([s * 0.05, -0.05, 0])));
  // chimney, vents and cap
  add(new THREE.TorusGeometry(0.014, 0.004, 5, 12).applyMatrix4(mat([0, -0.03, 0], [Math.PI / 2, 0, 0])));
  add(new THREE.CylinderGeometry(0.02, 0.024, 0.035, 10).applyMatrix4(mat([0, -0.05, 0])), BRASS);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 10).applyMatrix4(mat([0, -0.07, 0])));
  add(new THREE.CylinderGeometry(0.032, 0.078, 0.032, 4, 1).applyMatrix4(mat([0, -0.088, 0], [0, Math.PI / 4, 0])));
  add(new THREE.BoxGeometry(0.12, 0.007, 0.12).applyMatrix4(mat([0, -0.105, 0])));
  // bottom: tray, foot, burner, wick
  add(new THREE.BoxGeometry(0.12, 0.01, 0.12).applyMatrix4(mat([0, -0.275, 0])));
  add(new THREE.CylinderGeometry(0.058, 0.07, 0.024, 4, 1).applyMatrix4(mat([0, -0.292, 0], [0, Math.PI / 4, 0])));
  add(new THREE.CylinderGeometry(0.019, 0.022, 0.03, 10).applyMatrix4(mat([0, -0.256, 0])), BRASS);
  add(new THREE.CylinderGeometry(0.023, 0.023, 0.004, 10).applyMatrix4(mat([0, -0.24, 0])), BRASS);
  return merge(P);
}

function buildPosts() {
  const P = [];
  for (const x of [-0.052, 0.052]) {
    for (const z of [-0.052, 0.052]) {
      P.push(finalize(new THREE.BoxGeometry(0.008, 0.17, 0.008).applyMatrix4(mat([x, -0.19, z])), IRON));
    }
  }
  return merge(P);
}

function polyPath(cx, cy, n, r0, r1, rot = 0) {
  const p = new THREE.Path();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rot;
    const r = i % 2 ? r1 : r0;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  return p;
}

function buildShutterPanel() {
  // 0.1 x 0.16 punched-tin plate; local origin at the hinge edge. When the
  // shutters close, these holes are the only way out for the light: they glow
  // in view and project a star pattern through the shadow map.
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.1, 0), new THREE.Vector2(0.1, 0.16), new THREE.Vector2(0, 0.16),
  ]);
  shape.holes.push(polyPath(0.05, 0.075, 10, 0.03, 0.013, Math.PI / 2));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    shape.holes.push(polyPath(0.05 + Math.cos(a) * 0.041, 0.075 + Math.sin(a) * 0.05, 6, 0.0045, 0.0045));
  }
  shape.holes.push(polyPath(0.05, 0.148, 8, 0.004, 0.004));
  shape.holes.push(polyPath(0.05, 0.01, 8, 0.004, 0.004));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false });
  return finalize(g, BRASS);
}

function buildHand() {
  const P = [];
  const add = (g) => P.push(finalize(g, LEATHER));
  // gauntlet fist closed around the bail handle (at the pivot)
  add(new THREE.BoxGeometry(0.07, 0.045, 0.085, 2, 2, 2).applyMatrix4(mat([0.012, 0.03, 0.005], [0.1, 0, -0.15])));
  for (let i = 0; i < 4; i++) {
    const z = -0.03 + i * 0.02;
    add(limb([-0.035, 0.022, z], [-0.03, -0.006, z + 0.002], 0.011, 0.01, 7));
    add(limb([-0.03, -0.006, z + 0.002], [0.015, -0.01, z], 0.01, 0.009, 7));
  }
  add(limb([0.03, 0.02, -0.04], [-0.005, 0.005, -0.055], 0.012, 0.01, 7)); // thumb
  // wrist & forearm dropping steeply out of frame (bottom-right)
  add(limb([0.025, 0.035, 0.03], [0.11, -0.02, 0.11], 0.026, 0.031, 10));
  add(limb([0.11, -0.02, 0.11], [0.3, -0.14, 0.3], 0.032, 0.04, 10));
  // ragged cuff
  const cuff = new THREE.CylinderGeometry(0.05, 0.056, 0.05, 10, 1, true);
  cuff.applyMatrix4(mat([0.1, -0.012, 0.09], [0.9, 0, 1.1]));
  add(cuff);
  return merge(P);
}

// Open left palm, fingers splayed: the gesture that drives fire through the lantern.
function buildOffHand() {
  const P = [];
  const add = (g) => P.push(finalize(g, LEATHER));
  add(new THREE.BoxGeometry(0.085, 0.095, 0.03, 2, 2, 1));
  const tips = [[-0.05, 0.11, -0.02], [-0.015, 0.125, -0.025], [0.02, 0.12, -0.022], [0.05, 0.1, -0.015]];
  const roots = [[-0.03, 0.045], [-0.01, 0.048], [0.012, 0.048], [0.032, 0.044]];
  tips.forEach((t, k) => {
    const r = [roots[k][0], roots[k][1], 0];
    const m = [(r[0] + t[0]) / 2, (r[1] + t[1]) / 2 + 0.005, (r[2] + t[2]) / 2 - 0.004];
    add(limb(r, m, 0.011, 0.01, 6));
    add(limb(m, t, 0.01, 0.008, 6));
  });
  add(limb([0.045, -0.02, 0], [0.085, 0.03, -0.03], 0.012, 0.01, 6)); // thumb
  add(limb([0, -0.045, 0.005], [-0.02, -0.18, 0.12], 0.03, 0.036, 10)); // wrist/forearm
  add(limb([-0.02, -0.18, 0.12], [-0.06, -0.4, 0.3], 0.036, 0.045, 10));
  return merge(P);
}

export class Lantern {
  constructor(camera, events) {
    this.camera = camera;
    this.events = events;
    this.material = createWorldMaterial({ objectHatch: true, hatchScale: 5.0 });
    this.material.uniforms.uWetHeight.value = -10; // only per-vertex gloss on the viewmodel

    this.root = new THREE.Group();     // follows the hand (bob, lag)
    this.pivot = new THREE.Group();    // the handle: lantern swings around this
    this.root.add(this.pivot);
    camera.add(this.root);

    const body = new THREE.Mesh(buildBody(), this.material);
    const posts = new THREE.Mesh(buildPosts(), this.material);
    const hand = new THREE.Mesh(buildHand(), this.material);
    this.pivot.add(body, posts);
    this.root.add(hand);

    // Shutters: three pierced sliding plates. Wide glow = slid down out of the
    // way (below the frame); focused beam = raised around the flame on the left,
    // right and back so only the front window throws light.
    const panel = buildShutterPanel();
    this.shutters = [];
    const mk = (pos, rotY) => {
      const m = new THREE.Mesh(panel, this.material);
      m.position.set(...pos);
      m.rotation.y = rotY;
      this.pivot.add(m);
      this.shutters.push({ mesh: m, base: pos[1] });
    };
    mk([-0.056, -0.272, 0.05], Math.PI / 2);   // left: hinge edge at back, spans to front
    mk([0.056, -0.272, -0.05], -Math.PI / 2);  // right
    mk([-0.05, -0.272, 0.056], 0);             // back

    // flame
    this.flameMaterial = createFlameMaterial();
    const fg = new THREE.PlaneGeometry(0.036, 0.075);
    fg.translate(0, 0.0375, 0);
    this.flame = new THREE.Mesh(fg, this.flameMaterial);
    this.flame.position.set(0, -0.238, 0);
    this.flame.renderOrder = 10;
    this.flame.frustumCulled = false;
    this.pivot.add(this.flame);

    // The lantern body (cage, cap, shutters with their pierced stars) casts real
    // shadows from the flame inside it; the hand does not.
    setLayers(this.root, LAYERS.VIEWMODEL);
    setLayers(this.pivot, LAYERS.VIEWMODEL, LAYERS.CAGE);
    setLayers(this.flame, LAYERS.FX);

    this.holdPos = new THREE.Vector3(0.2, -0.05, -0.5);
    this.root.position.copy(this.holdPos);
    this.root.scale.setScalar(0.85);

    // dynamics
    this.swing = new THREE.Vector2();     // x: fore/aft, y: side
    this.swingVel = new THREE.Vector2();
    this.lag = new THREE.Vector2();
    this.focus = 0;
    this.focusTarget = 0;
    this.flicker = 1;
    this.flameWorld = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();

    // ---- off hand + fire meter ----
    this.offHand = new THREE.Mesh(buildOffHand(), this.material);
    this.offHand.layers.set(LAYERS.VIEWMODEL);
    this.offHand.visible = false;
    camera.add(this.offHand);
    this.offRest = new THREE.Vector3(-0.28, -0.6, -0.3);
    this.offActive = new THREE.Vector3(0.05, -0.2, -0.37);
    this.offBlend = 0;
    this.fuel = 1;
    this.burnout = false;
    this.recover = 0;
    this.blasting = false;
    this.blast = 0;          // smoothed 0..1 for visuals
    this._regenWait = 0;
    this.hitDim = 1;
    this.extinguish = 0;
    events.on('pump', () => {
      if (this.burnout) this.recover = Math.min(1, this.recover + GAME.pumpBoost);
    });

    events.on('focusToggle', () => {
      this.focusTarget = this.focusTarget > 0.5 ? 0 : 1;
      events.emit('focus', this.focusTarget);
    });
  }

  get focused() {
    return this.focusTarget > 0.5;
  }

  update(dt, t, player, game) {
    const L = settings.light;
    const playing = !game || game.state === 'playing';

    // ---- fire meter: blast drains, rest refills, empty = burnout ----
    const wantBlast = playing && player.rightHeld && !this.burnout && this.extinguish === 0;
    this.blasting = wantBlast && this.fuel > 0;
    if (this.blasting) {
      this.fuel = Math.max(0, this.fuel - dt * GAME.fuelDrain);
      this._regenWait = GAME.fuelRegenDelay;
      if (this.fuel <= 0) {
        this.burnout = true;
        this.recover = 0;
        this.blasting = false;
        this.events.emit('burnout', {});
      }
    } else if (this.burnout) {
      this.recover = Math.min(1, this.recover + dt / GAME.burnoutTime);
      if (this.recover >= 1) {
        this.burnout = false;
        this.fuel = 0.35;
        this.events.emit('rekindled', {});
      }
    } else {
      this._regenWait -= dt;
      if (this._regenWait <= 0) this.fuel = Math.min(1, this.fuel + dt * GAME.fuelRegen);
    }
    if (this.blasting !== this._wasBlasting) this.events.emit(this.blasting ? 'blastStart' : 'blastEnd', {});
    this._wasBlasting = this.blasting;
    this.blast += ((this.blasting ? 1 : 0) - this.blast) * (1 - Math.exp(-dt * (this.blasting ? 18 : 6)));

    // hits dim the flame; death puts it out
    const hits = game ? game.hits : 0;
    const targetDim = [1, 0.8, 0.64, 0.5][Math.min(hits, 3)];
    this.hitDim += (targetDim - this.hitDim) * (1 - Math.exp(-dt * 3));
    if (game && game.state === 'dead') this.extinguish = Math.min(1, this.extinguish + dt / 1.4);

    // ---- flicker: layered noise + occasional gutter ----
    const sp = L.flickerSpeed;
    const tt = t * sp;
    const n = 0.5 * n1(tt * 1.9, 1) + 0.3 * n1(tt * 4.7, 2) + 0.2 * n1(tt * 11.3, 3);
    const gut = n1(tt * 0.23, 4);
    const gutter = THREE.MathUtils.smoothstep(gut, 0.72, 0.92) * (0.55 + 0.45 * n1(tt * 22, 5));
    let f = 1 + L.flicker * ((n - 0.5) * 0.75 - gutter * 0.45);
    // lower flicker in the focused beam (shuttered flame is sheltered)
    f = THREE.MathUtils.lerp(f, 1 + (f - 1) * 0.5, this.focus);
    if (this.burnout) f *= 0.45 + 0.4 * n1(tt * 9.0, 9) + 0.15 * n1(tt * 31.0, 10); // sputtering wick
    if (this.blast > 0.01) f = THREE.MathUtils.lerp(f, 1.15 + 0.25 * n1(tt * 40.0, 11), this.blast);
    this.flicker = f;

    // ---- focus (shutters) ----
    const fr = 1 - Math.exp(-dt * 5);
    const focusGoal = this.blasting ? 1 : this.burnout ? 0 : this.focusTarget;
    this.focus += (focusGoal - this.focus) * (this.blasting ? 1 - Math.exp(-dt * 14) : fr);
    const fe = this.focus * this.focus * (3 - 2 * this.focus);
    for (const s of this.shutters) {
      s.mesh.position.y = s.base - (1 - fe) * 0.175;
      s.mesh.visible = fe > 0.02;
      // Only closed plates (with their pierced stars) throw shadows into the room.
      if (fe > 0.6) s.mesh.layers.enable(LAYERS.CAGE);
      else s.mesh.layers.disable(LAYERS.CAGE);
    }

    // ---- sway: damped pendulum driven by look + acceleration ----
    const sw = settings.player.sway;
    const k = 38, c = 3.2;
    const driveSide = player.yawRate * 1.1 - player.accelLocal.x * 0.35;
    const driveFore = -player.pitchRate * 0.6 + player.accelLocal.z * 0.35;
    this.swingVel.x += (-k * this.swing.x - c * this.swingVel.x + driveFore * sw * 6) * dt;
    this.swingVel.y += (-k * this.swing.y - c * this.swingVel.y + driveSide * sw * 6) * dt;
    this.swing.x = THREE.MathUtils.clamp(this.swing.x + this.swingVel.x * dt, -0.6, 0.6);
    this.swing.y = THREE.MathUtils.clamp(this.swing.y + this.swingVel.y * dt, -0.6, 0.6);
    this.pivot.rotation.set(this.swing.x + Math.sin(t * 0.9) * 0.015 * sw, 0, this.swing.y + Math.sin(t * 0.7 + 1) * 0.02 * sw);

    // hand lags behind the look and counter-bobs
    const lr = 1 - Math.exp(-dt * 8);
    this.lag.x += (THREE.MathUtils.clamp(-player.yawRate * 0.018, -0.08, 0.08) - this.lag.x) * lr;
    this.lag.y += (THREE.MathUtils.clamp(player.pitchRate * 0.012, -0.05, 0.05) - this.lag.y) * lr;
    const b = player.bob;
    this.root.position.set(
      this.holdPos.x + this.lag.x * sw - b.x * 0.4,
      this.holdPos.y + this.lag.y * sw - b.y * 0.5 + Math.sin(t * 1.3) * 0.003,
      this.holdPos.z + this.focus * 0.06,
    );
    this.root.rotation.set(0, -this.lag.x * 1.5, this.lag.x * 0.8);

    // ---- drive the light ----
    this.camera.updateMatrixWorld(true);
    this.flame.getWorldPosition(this.flameWorld);
    const j = L.jitter;
    this._tmp.set((n1(tt * 3.1, 6) - 0.5) * 2 * j, (n1(tt * 2.3, 7) - 0.5) * j + 0.025, (n1(tt * 2.7, 8) - 0.5) * 2 * j);
    // beam follows the lantern body (so it swings), biased to where you look
    this._fwd.set(0, -0.06, -1).applyQuaternion(this.pivot.getWorldQuaternion(new THREE.Quaternion())).normalize();
    shared.uSpotDir.value.copy(this._fwd);
    // the blast throws the light forward with the fire
    shared.uLightPos.value.copy(this.flameWorld).add(this._tmp).addScaledVector(this._fwd, this.blast * 0.45);

    const intensity = THREE.MathUtils.lerp(L.intensity, L.focusIntensity, fe);
    const life = this.hitDim * (1 - this.extinguish) * (this.burnout ? 0.38 : 1) * (1 + 0.6 * this.blast);
    shared.uLightIntensity.value = intensity * f * life;
    shared.uLightRange.value = THREE.MathUtils.lerp(L.range, L.focusRange, fe) * (this.burnout ? 0.6 : 1) * (0.6 + 0.4 * this.hitDim);
    shared.uFocus.value = fe;

    const heat = THREE.MathUtils.clamp(0.4 + (f - 1) * 1.2 + this.blast, 0, 1);
    shared.uLightColor.value.copy(paletteLinear.ember).lerp(paletteLinear.cream, heat);
    this.flameMaterial.uniforms.uFlicker.value = THREE.MathUtils.clamp((f - 0.55) / 0.7, 0, 1);
    this.flameMaterial.uniforms.uFlameGain.value = (1 - this.extinguish) * (this.burnout ? 0.55 : 1) * (1 + this.blast * 0.8);
    this.flame.scale.set(1 + this.blast * 0.3, (1 + this.blast * 0.6) * (this.burnout ? 0.6 : 1), 1);

    // off hand: rises in, palm thrust toward the lantern, trembling with the effort
    this.offBlend += ((this.blasting ? 1 : 0) - this.offBlend) * (1 - Math.exp(-dt * (this.blasting ? 16 : 7)));
    const ob = this.offBlend;
    this.offHand.visible = ob > 0.01;
    if (this.offHand.visible) {
      this.offHand.position.lerpVectors(this.offRest, this.offActive, ob);
      this.offHand.position.x += (Math.random() - 0.5) * 0.004 * this.blast;
      this.offHand.position.y += (Math.random() - 0.5) * 0.004 * this.blast - b.y * 0.4;
      this.offHand.rotation.set(0.15 - 0.3 * ob, -0.75 * ob - 0.2, 0.25 * (1 - ob));
    }
  }
}
