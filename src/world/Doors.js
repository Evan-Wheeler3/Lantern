// The great wooden door, the sanctum behind it, and the way down.
//  * barred while beacons are dark; the bar drops when the last one catches
//  * hint: the draft from the opened sanctum makes the keeper's flame lean toward it
//  * open it (hold E), read the lectern, descend through the well (hold E)
import * as THREE from 'three';
import { createWorldMaterial, createPortalMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { finalize, merge, pointedArch, mat, flipWinding } from './geo.js';
import { FLOOR_Y } from './props.js';

const WOOD = { tone: 0.5, gloss: 0.55 };
const IRON = { tone: 0.62, gloss: 0.85 };

function leafGeometry(w, springH, arch, side) {
  // one leaf of a pointed double door: x in [0, w] from the hinge (outer edge) inward
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, springH);
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * 0.5; // left half of the arch, hinge side -> apex
    const [ax, ay] = arch.at(t, 0);
    shape.lineTo(ax + w, springH + ay); // arch x is centred: -w..0 -> 0..w
  }
  shape.lineTo(w, 0);
  const parts = [finalize(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), WOOD)];
  // plank grooves (thin dark strips) and iron straps
  for (let k = 1; k < 4; k++) parts.push(finalize(new THREE.BoxGeometry(0.025, springH + 0.6, 0.02).applyMatrix4(mat([(w * k) / 4, (springH + 0.6) / 2, 0.13])), { tone: 0.18, gloss: 0.2 }));
  for (const y of [0.45, springH * 0.55, springH - 0.1]) parts.push(finalize(new THREE.BoxGeometry(w * 0.95, 0.09, 0.03).applyMatrix4(mat([w * 0.5, y, 0.14])), IRON));
  parts.push(finalize(new THREE.TorusGeometry(0.09, 0.018, 5, 12).applyMatrix4(mat([w - 0.22, springH * 0.5, 0.17])), IRON));
  const g = merge(parts);
  if (side > 0) { g.scale(-1, 1, 1); flipWinding(g); }
  return g;
}

export class Doors {
  constructor(scene, world, events, interactions, beacons) {
    this.events = events;
    this.world = world;
    this.beacons = beacons;
    const gd = world.greatDoor;
    this.door = gd;
    this.unlocked = false;
    this.open = 0;
    this.opening = false;
    this.canDescend = false;
    this.readPage = false;
    if (!gd) return;

    const mat0 = createWorldMaterial();
    // geometry is built in a local frame: x across the doorway, +z into the room
    const span = 2.3, arch = pointedArch(span, 0.65);
    const springH = 2.3 - FLOOR_Y;
    this.group = new THREE.Group();
    this.group.position.set(gd.x - gd.nx * 0.45, FLOOR_Y, gd.z - gd.nz * 0.45);
    this.group.rotation.y = Math.atan2(gd.nx, gd.nz);
    scene.add(this.group);
    this.leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * span / 2;
      const leaf = new THREE.Mesh(leafGeometry(span / 2, springH, arch, side), mat0);
      pivot.add(leaf);
      leaf.layers.set(LAYERS.WORLD);
      this.group.add(pivot);
      return { pivot, side };
    });
    // the bar across both leaves, in brackets
    this.bar = new THREE.Mesh(merge([
      finalize(new THREE.BoxGeometry(span + 0.5, 0.16, 0.14), IRON),
      finalize(new THREE.BoxGeometry(0.12, 0.3, 0.2).applyMatrix4(mat([-0.8, 0, 0])), IRON),
      finalize(new THREE.BoxGeometry(0.12, 0.3, 0.2).applyMatrix4(mat([0.8, 0, 0])), IRON),
    ]), mat0);
    this.bar.position.set(0, 1.3 - FLOOR_Y, 0.3);
    this.bar.layers.set(LAYERS.WORLD);
    this.group.add(this.bar);
    this.barFall = 0;

    // block the doorway until it opens
    const cx = gd.x - gd.nx * 0.45, cz = gd.z - gd.nz * 0.45;
    const along = gd.nz !== 0;
    this.collider = along
      ? { minX: cx - 1.5, maxX: cx + 1.5, minZ: cz - 0.3, maxZ: cz + 0.3, top: 99 }
      : { minX: cx - 0.3, maxX: cx + 0.3, minZ: cz - 1.5, maxZ: cz + 1.5, top: 99 };
    world.colliders.boxes.push(this.collider);

    events.on('allLit', () => {
      this.unlocked = true;
      events.emit('doorUnlocked', { x: gd.x, z: gd.z });
    });

    interactions.add({
      x: gd.x + gd.nx * 0.6, z: gd.z + gd.nz * 0.6, radius: 2.6, hold: 0.9, priority: 1,
      label: () => (this.unlocked ? 'Hold  E  to open the great door' : 'Barred. The beacons are still dark.'),
      enabled: () => this.open === 0 && !this.opening,
      onComplete: () => {
        if (!this.unlocked) { events.emit('doorRattle', { x: gd.x, z: gd.z }); return; }
        this.opening = true;
        this.collider.top = -99;
        events.emit('doorOpen', { x: gd.x, z: gd.z });
      },
    });

    // sanctum: lectern + well
    const sc = world.sanctumSpots;
    if (sc) {
      const lec = sc.lectern;
      interactions.add({
        x: lec.x, z: lec.z, radius: 1.9, hold: 0.25, priority: 1,
        label: () => 'E  —  read the page',
        enabled: () => this.open > 0.5,
        onComplete: () => { this.readPage = true; events.emit('readSanctum', {}); },
      });
      const w = sc.well;
      const portal = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), createPortalMaterial());
      portal.rotation.x = -Math.PI / 2;
      portal.position.set(w.x, 0.03, w.z);
      portal.layers.set(LAYERS.WORLD);
      portal.visible = false;
      scene.add(portal);
      this.portal = portal;
      interactions.add({
        x: w.x, z: w.z, radius: 2.0, hold: 1.0, priority: 0.8,
        label: () => 'Hold  E  to descend',
        enabled: () => this.open > 0.8,
        onComplete: () => events.emit('escaped', {}),
      });
    }
  }

  // Direction (world xz, normalised) from p toward the opened sanctum, or null.
  draftDir(p) {
    if (!this.door || !this.unlocked) return null;
    const dx = this.door.x - p.x, dz = this.door.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, dist: l };
  }

  update(dt, t) {
    if (!this.door) return;
    if (this.unlocked && this.barFall < 1) {
      this.barFall = Math.min(1, this.barFall + dt * 1.6);
      const f = this.barFall;
      this.bar.position.y = 1.3 - FLOOR_Y - f * f * 1.25;
      this.bar.rotation.z = f * 0.5;
    }
    if (this.opening) this.open = Math.min(1, this.open + dt / 2.2);
    const e = this.open * this.open * (3 - 2 * this.open);
    for (const l of this.leaves) l.pivot.rotation.y = l.side * -e * 1.75; // swing away from the room
    if (this.portal) {
      this.portal.visible = this.open > 0.6;
      this.portal.material.uniforms.uOpen.value = Math.max(0, (this.open - 0.6) / 0.4) * (0.75 + 0.25 * Math.sin(t * 2));
    }
  }
}
