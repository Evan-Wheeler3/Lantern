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

function buildShutterPanel() {
  // 0.1 x 0.16 panel with a pierced star; local origin at the hinge edge.
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.1, 0), new THREE.Vector2(0.1, 0.16), new THREE.Vector2(0, 0.16),
  ]);
  const hole = new THREE.Path();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.012 : 0.026;
    const v = new THREE.Vector2(0.05 + Math.cos(a) * r, 0.085 + Math.sin(a) * r);
    if (i === 0) hole.moveTo(v.x, v.y); else hole.lineTo(v.x, v.y);
  }
  shape.holes.push(hole);
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

    events.on('focusToggle', () => {
      this.focusTarget = this.focusTarget > 0.5 ? 0 : 1;
      events.emit('focus', this.focusTarget);
    });
  }

  get focused() {
    return this.focusTarget > 0.5;
  }

  update(dt, t, player) {
    const L = settings.light;

    // ---- flicker: layered noise + occasional gutter ----
    const sp = L.flickerSpeed;
    const tt = t * sp;
    const n = 0.5 * n1(tt * 1.9, 1) + 0.3 * n1(tt * 4.7, 2) + 0.2 * n1(tt * 11.3, 3);
    const gut = n1(tt * 0.23, 4);
    const gutter = THREE.MathUtils.smoothstep(gut, 0.72, 0.92) * (0.55 + 0.45 * n1(tt * 22, 5));
    let f = 1 + L.flicker * ((n - 0.5) * 0.75 - gutter * 0.45);
    // lower flicker in the focused beam (shuttered flame is sheltered)
    f = THREE.MathUtils.lerp(f, 1 + (f - 1) * 0.5, this.focus);
    this.flicker = f;

    // ---- focus (shutters) ----
    const fr = 1 - Math.exp(-dt * 5);
    this.focus += (this.focusTarget - this.focus) * fr;
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
    shared.uLightPos.value.copy(this.flameWorld).add(this._tmp);

    const intensity = THREE.MathUtils.lerp(L.intensity, L.focusIntensity, fe);
    shared.uLightIntensity.value = intensity * f;
    shared.uLightRange.value = THREE.MathUtils.lerp(L.range, L.focusRange, fe);
    shared.uFocus.value = fe;
    // beam follows the lantern body (so it swings), biased to where you look
    this._fwd.set(0, -0.06, -1).applyQuaternion(this.pivot.getWorldQuaternion(new THREE.Quaternion())).normalize();
    shared.uSpotDir.value.copy(this._fwd);

    const heat = THREE.MathUtils.clamp(0.4 + (f - 1) * 1.2, 0, 1);
    shared.uLightColor.value.copy(paletteLinear.ember).lerp(paletteLinear.cream, heat);
    this.flameMaterial.uniforms.uFlicker.value = THREE.MathUtils.clamp((f - 0.55) / 0.7, 0, 1);
  }
}
