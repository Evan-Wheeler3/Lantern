// Drips: each source on the ceiling releases a drop on its own rhythm. Drops fall
// under gravity, catch the lantern light on the way down (drips shader), and on
// impact emit a 'drip' event (-> ripple ring + positional plink).
import * as THREE from 'three';
import { createDripMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { settings } from '../core/Settings.js';
import { mulberry32 } from '../core/noise.js';

const MAX_DROPS = 48;

export class Drips {
  constructor(sources, events, surfaceHeightAt) {
    this.events = events;
    this.surfaceHeightAt = surfaceHeightAt;
    this.rand = mulberry32(99);
    this.sources = sources.map((s) => ({ ...s, timer: this.rand() * s.period }));
    this.drops = [];
    this.positions = new Float32Array(MAX_DROPS * 3);
    this.alphas = new Float32Array(MAX_DROPS);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, createDripMaterial());
    this.points.frustumCulled = false;
    this.points.layers.set(LAYERS.FX);
  }

  // A single drop falling from (x, y, z) — e.g. off a ceiling crawler.
  drop(x, y, z) {
    if (this.drops.length >= MAX_DROPS) return;
    this.drops.push({ x, y, z, vy: 0, floor: this.surfaceHeightAt(x, z), life: 0.35 });
  }

  update(dt) {
    const rate = settings.particles.dripRate;
    if (rate > 0) {
      for (const s of this.sources) {
        s.timer -= dt * rate;
        if (s.timer <= 0) {
          s.timer = s.period * (0.6 + this.rand() * 0.8);
          if (this.drops.length < MAX_DROPS) {
            const floor = this.surfaceHeightAt(s.x, s.z);
            this.drops.push({ x: s.x, y: s.y, z: s.z, vy: 0, floor, life: 0 });
          }
        }
      }
    }
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life += dt;
      // brief "hang" at the dripstone before letting go
      if (d.life > 0.35) {
        d.vy -= 9.81 * dt;
        d.y += d.vy * dt;
      }
      if (d.y <= d.floor) {
        this.events.emit('drip', { x: d.x, y: d.floor, z: d.z, speed: -d.vy, onWater: d.floor <= 0.01 });
        this.drops.splice(i, 1);
      }
    }
    for (const d of this.drops) {
      this.positions[n * 3] = d.x;
      this.positions[n * 3 + 1] = d.y;
      this.positions[n * 3 + 2] = d.z;
      this.alphas[n] = Math.min(1, d.life * 4);
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}
