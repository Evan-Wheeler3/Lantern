// Beacons: ancient braziers the keeper kindles. Each lit beacon becomes a
// permanent room light (lk_beacons in the shaders), a sanctuary monsters won't
// enter, and reveals its room on the minimap. Lighting all of them unseals the exit.
import * as THREE from 'three';
import { createFlameMaterial, createWorldMaterial, createPortalMaterial } from '../renderer/Materials.js';
import { shared } from '../renderer/SharedUniforms.js';
import { LAYERS } from '../renderer/Layers.js';
import { valueNoise3 } from '../core/noise.js';
import { finalize, pointedArch } from './geo.js';
import { FLOOR_Y } from './props.js';
import { GAME } from '../core/GameConfig.js';

export class Beacons {
  constructor(scene, world, events) {
    this.world = world;
    this.events = events;
    this.list = world.beaconFires.map((f, i) => {
      const flameMat = createFlameMaterial();
      const big = f.kind === 'great';
      const g = new THREE.PlaneGeometry(big ? 0.9 : 0.55, big ? 1.7 : 1.05);
      g.translate(0, big ? 0.85 : 0.52, 0);
      flameMat.uniforms.uFlameGain.value = 0.42; // big flames: keep the shape readable under bloom
      const flame = new THREE.Mesh(g, flameMat);
      flame.position.copy(f.pos).y -= 0.15;
      flame.visible = false;
      flame.frustumCulled = false;
      flame.layers.set(LAYERS.FX);
      scene.add(flame);
      const r = f.room;
      shared.uBeaconBox.value[i].set(r.cx - r.w / 2 - 0.7, r.cz - r.d / 2 - 0.7, r.cx + r.w / 2 + 0.7, r.cz + r.d / 2 + 0.7);
      return { index: i, ...f, lit: false, level: 0, progress: 0, flame, flameMat, seed: i * 7.3 };
    });
    this.total = this.list.length;
    this.litCount = 0;
    this.prompt = null; // { beacon, progress } for the HUD

    // ---- exit door: an iron-bound slab under a pointed arch, glowing behind once open
    const d = world.door;
    this.door = d;
    this.doorOpen = 0;
    this.doorUnsealed = false;
    if (d) {
      const shape = new THREE.Shape();
      const arch = pointedArch(d.span, 0.6);
      const base = FLOOR_Y - d.springY; // shape origin at the spring line
      shape.moveTo(-d.span / 2, base);
      shape.lineTo(-d.span / 2, 0);
      for (let k = 0; k <= 20; k++) { const [x, y] = arch.at(k / 20, 0); shape.lineTo(x, y); }
      shape.lineTo(d.span / 2, base);
      const slabGeo = finalize(new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false }), { tone: 0.55, gloss: 0.7 });
      this.doorMesh = new THREE.Mesh(slabGeo, createWorldMaterial());
      const portal = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), createPortalMaterial());
      this.portalMat = portal.material;
      const group = new THREE.Group();
      group.add(this.doorMesh, portal);
      // wall face is at local z = 0; the glow sits on it, the slab in front of it
      portal.position.z = 0.03;
      this.doorMesh.position.z = 0.06;
      // local +z = into the room
      group.position.set(d.x, d.springY, d.z);
      group.rotation.y = Math.atan2(d.nx, d.nz);
      this.doorMesh.layers.set(LAYERS.WORLD);
      portal.layers.set(LAYERS.WORLD);
      portal.visible = false;
      this.portal = portal;
      scene.add(group);
      this.doorGroup = group;
      // the exit's light uses the slot after the last beacon
      this.doorSlot = Math.min(this.total, 7);
      const room = world.dungeon.exit;
      shared.uBeaconBox.value[this.doorSlot].set(room.cx - room.w / 2 - 0.7, room.cz - room.d / 2 - 0.7, room.cx + room.w / 2 + 0.7, room.cz + room.d / 2 + 0.7);
      this.doorCenter = new THREE.Vector3(d.x + d.nx * 0.6, 0, d.z + d.nz * 0.6);
    }
  }

  nearestUnlit(x, z) {
    let best = null;
    for (const b of this.list) {
      if (b.lit) continue;
      const dd = Math.hypot(b.pos.x - x, b.pos.z - z);
      if (dd < GAME.kindleRadius && (!best || dd < best.d)) best = { b, d: dd };
    }
    return best?.b || null;
  }

  kindle(b) {
    if (b.lit) return;
    b.lit = true;
    b.flame.visible = true;
    this.litCount++;
    this.events.emit('beaconLit', { index: b.index, room: b.room, count: this.litCount, total: this.total, pos: b.pos });
    if (this.litCount === this.total) {
      this.doorUnsealed = true;
      this.events.emit('allLit', {});
    }
  }

  update(dt, t, player, game) {
    // ---- kindling (hold E near an unlit beacon) ----
    this.prompt = null;
    if (game.state === 'playing') {
      const b = this.nearestUnlit(player.feet.x, player.feet.z);
      if (b) {
        if (player.interactHeld) b.progress = Math.min(1, b.progress + dt / GAME.kindleTime);
        else b.progress = Math.max(0, b.progress - dt * 2);
        this.prompt = { kind: 'kindle', progress: b.progress };
        if (b.progress >= 1) this.kindle(b);
      }
    }

    // ---- lit beacons breathe ----
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

    // ---- the exit ----
    if (this.door) {
      if (this.doorUnsealed) this.doorOpen = Math.min(1, this.doorOpen + dt / 3.5);
      const o = this.doorOpen;
      this.doorMesh.position.y = -o * (this.door.springY - FLOOR_Y + this.door.rise + 0.3);
      this.portal.visible = o > 0;
      this.portalMat.uniforms.uOpen.value = o;
      const slot = shared.uBeaconPos.value[this.doorSlot];
      if (o > 0) {
        slot.set(this.door.x + this.door.nx * 1.2, 1.6, this.door.z + this.door.nz * 1.2, o * 2.2 * (0.92 + 0.08 * Math.sin(t * 3.1)));
      } else if (this.doorSlot >= this.total) slot.set(0, 0, 0, 0);
      if (o > 0.85 && game.state === 'playing') {
        const dd = Math.hypot(player.feet.x - this.doorCenter.x, player.feet.z - this.doorCenter.z);
        this.prompt = dd < 3.2 ? { kind: 'exit' } : this.prompt;
        if (dd < 1.3) this.events.emit('escaped', {});
      }
    }
  }
}
