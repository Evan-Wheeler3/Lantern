// The blast made visible: tongues of fire driven out of the lantern's front window.
import * as THREE from 'three';
import { createFireMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { shared } from '../renderer/SharedUniforms.js';

const MAX = 320;

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
  }

  update(dt, lantern) {
    const dir = shared.uSpotDir.value;
    if (lantern.blasting) {
      this._acc += dt * 150;
      const o = lantern.flameWorld;
      while (this._acc >= 1 && this.p.length < MAX) {
        this._acc -= 1;
        const sp = 7 + Math.random() * 4;
        const jx = (Math.random() - 0.5) * 1.6, jy = (Math.random() - 0.5) * 1.2, jz = (Math.random() - 0.5) * 1.6;
        this.p.push({
          x: o.x + dir.x * 0.22, y: o.y + dir.y * 0.22 + 0.02, z: o.z + dir.z * 0.22,
          vx: dir.x * sp + jx, vy: dir.y * sp + jy + 0.3, vz: dir.z * sp + jz,
          a: 0, life: 0.28 + Math.random() * 0.2, s: Math.random(),
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
