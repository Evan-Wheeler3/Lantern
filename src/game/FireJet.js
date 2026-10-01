// The blast made visible: tongues of fire driven out of the lantern's front window.
import * as THREE from 'three';
import { createFireMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { shared } from '../renderer/SharedUniforms.js';

const MAX = 520;

export class FireJet {
  constructor(scene) {
    this.p = [];
    this.pos = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX);
    this.seed = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, createFireMaterial());
    this.points.frustumCulled = false;
    this.points.layers.set(LAYERS.FX);
    scene.add(this.points);
    this._acc = 0;
    this._u = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  update(dt, lantern) {
    const dir = shared.uSpotDir.value;
    if (lantern.blasting) {
      this._acc += dt * 230;
      const o = lantern.flameWorld;
      // basis across the jet, so the flame front can be cut into a star
      this._u.crossVectors(dir, this._up).normalize();
      this._w.crossVectors(this._u, dir).normalize();
      const spin = performance.now() * 0.0004;
      while (this._acc >= 1 && this.p.length < MAX) {
        this._acc -= 1;
        const sp = 7.5 + Math.random() * 3;
        let ex = 0, ey = 0;
        if (Math.random() < 0.85) {
          // a point on the outline of a five-pointed star
          const k = Math.floor(Math.random() * 10), f = Math.random();
          const a0 = (k / 10) * Math.PI * 2 + spin, a1 = ((k + 1) / 10) * Math.PI * 2 + spin;
          const r0 = k % 2 ? 0.42 : 1, r1 = k % 2 ? 1 : 0.42;
          ex = Math.cos(a0) * r0 * (1 - f) + Math.cos(a1) * r1 * f;
          ey = Math.sin(a0) * r0 * (1 - f) + Math.sin(a1) * r1 * f;
        }
        const spread = 4.2;
        this.p.push({
          x: o.x + dir.x * 0.22, y: o.y + dir.y * 0.22 + 0.02, z: o.z + dir.z * 0.22,
          vx: dir.x * sp + (this._u.x * ex + this._w.x * ey) * spread,
          vy: dir.y * sp + (this._u.y * ex + this._w.y * ey) * spread + 0.2,
          vz: dir.z * sp + (this._u.z * ex + this._w.z * ey) * spread,
          a: 0, life: 0.3 + Math.random() * 0.18, s: Math.random(),
        });
      }
    } else this._acc = 0;
    let n = 0;
    for (let k = this.p.length - 1; k >= 0; k--) {
      const q = this.p[k];
      q.a += dt / q.life;
      if (q.a >= 1) { this.p.splice(k, 1); continue; }
      const drag = Math.exp(-dt * 2.8);
      q.vx *= drag; q.vy = q.vy * drag + dt * 2.0; q.vz *= drag;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    }
    for (const q of this.p) {
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      this.age[n] = q.a; this.seed[n] = q.s;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aAge.needsUpdate = true;
    g.attributes.aSeed.needsUpdate = true;
  }
}
