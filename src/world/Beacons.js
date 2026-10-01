// Beacons: ancient braziers the keeper kindles. Each lit beacon becomes a
// permanent room light (lk_beacons in the shaders), a sanctuary monsters won't
// enter, reveals its room on the minimap, and wakes a piece of the story.
import * as THREE from 'three';
import { createFlameMaterial } from '../renderer/Materials.js';
import { shared } from '../renderer/SharedUniforms.js';
import { LAYERS } from '../renderer/Layers.js';
import { valueNoise3 } from '../core/noise.js';
import { GAME } from '../core/GameConfig.js';

export class Beacons {
  constructor(scene, world, events, interactions) {
    this.world = world;
    this.events = events;
    this.list = world.beaconFires.map((f, i) => {
      const flameMat = createFlameMaterial();
      flameMat.uniforms.uFlameGain.value = 0.42; // big flames: keep the shape readable under bloom
      const big = f.kind === 'great';
      const g = new THREE.PlaneGeometry(big ? 0.9 : 0.55, big ? 1.7 : 1.05);
      g.translate(0, big ? 0.85 : 0.52, 0);
      const flame = new THREE.Mesh(g, flameMat);
      flame.position.copy(f.pos).y -= 0.15;
      flame.visible = false;
      flame.frustumCulled = false;
      flame.layers.set(LAYERS.FX);
      scene.add(flame);
      const r = f.room;
      shared.uBeaconBox.value[i].set(r.cx - r.w / 2 - 0.7, r.cz - r.d / 2 - 0.7, r.cx + r.w / 2 + 0.7, r.cz + r.d / 2 + 0.7);
      return { index: i, ...f, lit: false, level: 0, flame, flameMat, seed: i * 7.3 };
    });
    this.total = this.list.length;
    this.litCount = 0;
    for (const b of this.list) {
      interactions.add({
        x: b.pos.x, z: b.pos.z, radius: GAME.kindleRadius, hold: GAME.kindleTime, priority: 0.5,
        label: () => 'Hold  E  to kindle the beacon',
        enabled: () => !b.lit,
        onComplete: () => this.kindle(b),
      });
    }
  }

  get allLit() {
    return this.litCount >= this.total;
  }

  kindle(b) {
    if (b.lit) return;
    b.lit = true;
    b.flame.visible = true;
    this.litCount++;
    this.events.emit('beaconLit', { index: b.index, room: b.room, count: this.litCount, total: this.total, pos: b.pos, beacon: b });
    if (this.allLit) this.events.emit('allLit', {});
  }

  update(dt, t) {
    for (const b of this.list) {
      const slot = shared.uBeaconPos.value[b.index];
      if (!b.lit) { slot.set(0, 0, 0, 0); continue; }
      b.level = Math.min(1, b.level + dt / 1.6);
      const ease = b.level * b.level * (3 - 2 * b.level);
      const f = 0.85 + 0.25 * valueNoise3(t * 2.1, b.seed, 0.5) + 0.1 * valueNoise3(t * 7.3, b.seed + 3, 0.5);
      const big = b.kind === 'great';
      slot.set(b.pos.x, b.pos.y + 0.4, b.pos.z, ease * (big ? 2.6 : 2.0) * f);
      b.flame.scale.setScalar(Math.max(0.05, ease) * (0.9 + 0.15 * f));
      b.flameMat.uniforms.uFlicker.value = Math.min(1, f);
    }
  }
}
