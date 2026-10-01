// Spilled oil: the only resource. Gathering takes both hands, so the lantern is
// hung at the belt (dim, no beam, no blast) while you scoop.
import * as THREE from 'three';
import { createOilMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { GAME } from '../core/GameConfig.js';

export class OilSpills {
  constructor(scene, world, events, interactions, economy) {
    this.events = events;
    this.economy = economy;
    this.list = world.oil.map((o) => {
      const mat = createOilMaterial();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * 6.28;
      mesh.position.set(o.x, 0.012, o.z);
      mesh.layers.set(LAYERS.WORLD);
      scene.add(mesh);
      const spill = { ...o, left: o.amount, mesh, mat };
      interactions.add({
        x: o.x, z: o.z, radius: 1.8, hold: 0, priority: 0.2,
        label: () => `Hold  E  to gather oil   (${Math.ceil(spill.left)})`,
        enabled: () => spill.left > 0,
        onHold: (dt) => { this._held = spill; this._heldDt = dt; },
        progressFn: () => 1 - spill.left / spill.amount,
      });
      return spill;
    });
    this.collecting = false;
    this._held = null;
    this._ready = 0; // hands need a moment to get into the oil
  }

  update(dt) {
    const s = this._held;
    this._held = null;
    this.collecting = !!s;
    if (s) {
      this._ready = Math.min(1, this._ready + dt / GAME.stowTime);
      if (this._ready >= 1) {
        const take = Math.min(s.left, GAME.oilGatherRate * dt);
        s.left -= take;
        this.economy.gain(take);
        if (Math.random() < dt * 6) this.events.emit('oilScoop', { x: s.x, z: s.z });
        if (s.left <= 0) { s.mesh.visible = false; this.events.emit('oilEmptied', {}); }
      }
    } else this._ready = Math.max(0, this._ready - dt * 3);
    for (const sp of this.list) sp.mat.uniforms.uFill.value = sp.left / sp.amount;
  }
}
