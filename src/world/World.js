// World system: builds the room, owns its dynamic pieces (chains, drips, embers,
// water) and answers spatial queries (collision, ground height) for the player
// and future gameplay systems (AI pathing, beacon interaction...).
import * as THREE from 'three';
import { buildCathedral, LAYOUT } from './Cathedral.js';
import { buildTallOne, buildMourner } from './Creatures.js';
import { Chains } from './Chains.js';
import { Water } from './Water.js';
import { Drips } from './Drips.js';
import { Embers } from './Embers.js';
import { createWorldMaterial, createCreatureMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { settings } from '../core/Settings.js';

export class World {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.layout = LAYOUT;

    const built = buildCathedral();
    this.colliders = built.colliders;
    this.walkables = built.walkables;
    this.beacons = built.beacons; // gameplay hook: these will be lit later

    this.material = createWorldMaterial();
    this.creatureMaterial = createCreatureMaterial();

    this.room = new THREE.Group();
    this.room.name = 'cathedral';
    for (const g of built.geometries) {
      const m = new THREE.Mesh(g, this.material);
      m.layers.set(LAYERS.WORLD);
      this.room.add(m);
    }
    scene.add(this.room);

    // creatures (static, they only *watch*)
    this.creatures = [];
    const tall = new THREE.Mesh(buildTallOne(), this.creatureMaterial);
    tall.position.set(1.4, LAYOUT.floorY + 0.05, -19.0);
    tall.rotation.y = -0.15;
    const mourner = new THREE.Mesh(buildMourner(), this.creatureMaterial);
    mourner.position.set(5.9, LAYOUT.floorY + 0.1, -7.6);
    mourner.rotation.y = 0.13; // bowed toward the dead beacon in the aisle
    for (const c of [tall, mourner]) {
      c.layers.set(LAYERS.WORLD);
      scene.add(c);
      this.creatures.push(c);
      this.colliders.circles.push({ x: c.position.x, z: c.position.z, r: 0.45 });
    }

    this.chains = new Chains(built.chainAnchors, this.material);
    scene.add(this.chains.group);

    this.water = new Water({
      minX: -LAYOUT.halfWidth, maxX: LAYOUT.halfWidth, minZ: LAYOUT.platformZ, maxZ: LAYOUT.zEntrance, level: LAYOUT.waterLevel,
    });
    scene.add(this.water.mesh);

    this.drips = new Drips(built.dripSources, events, (x, z) => this.surfaceHeight(x, z));
    scene.add(this.drips.points);

    this.embers = new Embers();
    scene.add(this.embers.points);

    events.on('drip', (d) => { if (d.onWater) this.water.ripples.add(d.x, d.z, 0.9); });
    events.on('footstep', (f) => { if (f.wet) this.water.ripples.add(f.x, f.z, 0.6 + f.speed * 0.15); });
  }

  // Highest walkable surface under (x, z) (stairs, platform), else the drowned floor.
  groundHeight(x, z) {
    let h = LAYOUT.floorY;
    for (const w of this.walkables) {
      if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) h = Math.max(h, w.top);
    }
    return h;
  }

  // Where something falling from above would land (water surface or dry stone).
  surfaceHeight(x, z) {
    return Math.max(LAYOUT.waterLevel, this.groundHeight(x, z));
  }

  // True if a circle of `radius` at (x,z) overlaps a solid at foot height `feet`.
  blocked(x, z, radius, feet) {
    const L = LAYOUT;
    if (x < -L.halfWidth + radius || x > L.halfWidth - radius) return true;
    if (z > L.zEntrance - radius || z < L.zApse + radius) return true;
    for (const c of this.colliders.circles) {
      const dx = x - c.x, dz = z - c.z;
      const r = c.r + radius;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const b of this.colliders.boxes) {
      if (feet >= b.top - 0.05) continue; // standing on top of it
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  update(dt, time) {
    this.chains.update(time);
    this.drips.update(dt);
    this.embers.update();
    this.water.update();
    const c = settings.creatures;
    this.creatureMaterial.uniforms.uRim.value.set(c.rimPower, c.rimThreshold, c.rimBase);
  }
}
