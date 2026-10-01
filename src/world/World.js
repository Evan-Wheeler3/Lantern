// World system: generates the dungeon for a seed, builds it, owns its dynamic
// pieces (chains, drips, embers, water) and answers spatial queries for the
// player, monsters and UI (collision, ground height, line of sight, rooms).
import * as THREE from 'three';
import { Dungeon } from './Dungeon.js';
import { buildDungeon } from './DungeonBuilder.js';
import { FLOOR_Y } from './props.js';
import { Chains } from './Chains.js';
import { Water } from './Water.js';
import { Drips } from './Drips.js';
import { Embers } from './Embers.js';
import { createWorldMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';

export class World {
  constructor(scene, events, seed) {
    this.scene = scene;
    this.events = events;
    this.layout = { floorY: FLOOR_Y, waterLevel: 0 };

    this.dungeon = new Dungeon(seed);
    const dg = this.dungeon;
    const built = buildDungeon(dg);
    this.colliders = built.colliders;
    this.walkables = built.walkables;
    this.beaconFires = built.beaconFires;
    this.door = built.door;

    this.material = createWorldMaterial();
    this.root = new THREE.Group();
    this.root.name = 'dungeon';
    for (const g of built.geometries) {
      const m = new THREE.Mesh(g, this.material);
      m.layers.set(LAYERS.WORLD);
      this.root.add(m);
    }
    scene.add(this.root);

    this.chains = new Chains(built.chains, this.material);
    scene.add(this.chains.group);

    this.water = new Water({ minX: -dg.W / 2, maxX: dg.W / 2, minZ: -dg.H / 2, maxZ: dg.H / 2, level: 0 });
    scene.add(this.water.mesh);

    this.drips = new Drips(built.drips, events, (x, z) => this.surfaceHeight(x, z));
    scene.add(this.drips.points);

    this.embers = new Embers();
    scene.add(this.embers.points);

    events.on('drip', (d) => { if (d.onWater) this.water.ripples.add(d.x, d.z, 0.9); });
    events.on('footstep', (f) => { if (f.wet) this.water.ripples.add(f.x, f.z, 0.6 + f.speed * 0.15); });
  }

  // Spawn pose: centre of the start room, facing its first hallway.
  startPose() {
    const r = this.dungeon.start;
    const to = this.dungeon.rooms[r.links[0]] || r;
    const yaw = Math.atan2(-(to.cx - r.cx), -(to.cz - r.cz));
    return { x: r.cx, z: r.cz, yaw };
  }

  groundHeight(x, z) {
    let h = FLOOR_Y;
    for (const w of this.walkables) {
      if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) h = Math.max(h, w.top);
    }
    return h;
  }

  surfaceHeight(x, z) {
    return Math.max(this.layout.waterLevel, this.groundHeight(x, z));
  }

  // Circle of `radius` at (x,z) overlaps a wall cell, pillar or prop?
  // `extraSolid(i, j)` lets monsters treat sanctuaries as walls.
  blocked(x, z, radius, feet = FLOOR_Y, extraSolid = null) {
    const dg = this.dungeon;
    const i0 = dg.toI(x - radius), i1 = dg.toI(x + radius);
    const j0 = dg.toJ(z - radius), j1 = dg.toJ(z + radius);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (dg.isFloor(i, j) && !(extraSolid && extraSolid(i, j))) continue;
        const cx = Math.max(dg.cellX(i) - 0.5, Math.min(x, dg.cellX(i) + 0.5));
        const cz = Math.max(dg.cellZ(j) - 0.5, Math.min(z, dg.cellZ(j) + 0.5));
        if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
      }
    }
    for (const c of this.colliders.circles) {
      const dx = x - c.x, dz = z - c.z;
      const r = c.r + radius;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const b of this.colliders.boxes) {
      if (feet >= b.top - 0.05) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
    }
    return false;
  }

  update(dt, time) {
    this.chains.update(time);
    this.drips.update(dt);
    this.embers.update();
    this.water.update();
  }
}
