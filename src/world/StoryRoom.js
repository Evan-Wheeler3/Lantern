// What wakes when a beacon is kindled. Every beacon room carries one beat of the
// story (see data/story.js): a mural surfacing from the wall, an echo of shadow
// figures replaying a moment, or a dead keeper with a journal page.
import * as THREE from 'three';
import { createWorldMaterial, createCreatureMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { settings } from '../core/Settings.js';
import { mulberry32 } from '../core/noise.js';
import { finalize, merge, mat } from './geo.js';
import { buildKeeper } from './Creatures.js';
import { FLOOR_Y } from './props.js';

const STONE = { tone: 0.8, gloss: 0.1 };

// A carved relief: a procession of hooded figures under a star-lantern, built as
// a flat panel (stays) and a relief layer (rises out of the stone when lit).
function buildMural(seed) {
  const R = mulberry32(seed);
  // dark slab (no masonry: gloss > 0.5), pale relief: the carving lands in a brighter band
  const panel = [finalize(new THREE.BoxGeometry(3.2, 2.1, 0.1, 4, 3, 1), { tone: 0.38, gloss: 0.55 })];
  panel.push(finalize(new THREE.BoxGeometry(3.4, 0.14, 0.2).applyMatrix4(mat([0, 1.1, 0.05])), STONE));
  panel.push(finalize(new THREE.BoxGeometry(3.4, 0.14, 0.2).applyMatrix4(mat([0, -1.1, 0.05])), STONE));
  for (const x of [-1.2, 1.2]) panel.push(finalize(new THREE.BoxGeometry(0.3, 0.5, 0.45).applyMatrix4(mat([x, -1.35, -0.12])), STONE));
  const relief = [];
  const fig = (x, y, h, lean) => {
    const s = new THREE.Shape();
    s.moveTo(x - h * 0.22, y); s.lineTo(x + h * 0.22, y);
    s.lineTo(x + h * 0.08 + lean, y + h * 0.78); s.lineTo(x - h * 0.08 + lean, y + h * 0.78); s.closePath();
    relief.push(new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false }));
    const pts = [];
    for (let k = 0; k < 12; k++) {
      const an = (k / 12) * Math.PI * 2;
      pts.push(new THREE.Vector2(x + lean + Math.cos(an) * h * 0.1, y + h * 0.88 + Math.sin(an) * h * 0.11));
    }
    relief.push(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.07, bevelEnabled: false }));
  };
  const n = 4 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const x = -1.3 + (k + 0.5) * (2.6 / n) + (R() - 0.5) * 0.1;
    fig(x, -0.95 + k * 0.08, 0.9 + R() * 0.3, 0.05);
  }
  // the star lantern above the procession
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    const r = k % 2 ? 0.1 : 0.24;
    const p = [1.05 + Math.cos(a) * r, 0.62 + Math.sin(a) * r];
    if (k) star.lineTo(...p); else star.moveTo(...p);
  }
  relief.push(new THREE.ExtrudeGeometry(star, { depth: 0.09, bevelEnabled: false }));
  // rays
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (0.55 + k * 0.13);
    const ray = new THREE.BoxGeometry(0.035, 0.5 + R() * 0.3, 0.04);
    ray.translate(0, 0.55, 0.02);
    ray.rotateZ(a - Math.PI / 2 + Math.PI);
    ray.translate(1.05, 0.62, 0);
    relief.push(ray);
  }
  return {
    panel: merge(panel),
    relief: merge(relief.map((g) => finalize(g.scale(1, 1, 1.8), { tone: 1.0, gloss: 0.6 }))),
  };
}

export class StoryRoom {
  constructor(scene, world, events, interactions, beacons, story, plates) {
    this.events = events;
    this.plates = plates;
    this.items = [];
    const worldMat = createWorldMaterial();
    beacons.list.forEach((b, i) => {
      const beat = story.beacons[i % story.beacons.length];
      if (!beat) return;
      let type = beat.type;
      const walls = b.walls || [];
      if (type === 'mural' && !walls.length) type = 'keeper';
      const it = { beacon: b, beat, type, t: -1, read: false };
      const room = b.room;
      if (type === 'mural') {
        const w = walls[i % walls.length];
        const m = buildMural(i * 31 + 7);
        const g = new THREE.Group();
        const panel = new THREE.Mesh(m.panel, worldMat);
        const relief = new THREE.Mesh(m.relief, worldMat);
        relief.scale.z = 0.02;
        g.add(panel, relief);
        g.position.set(w.x + w.nx * 0.42, 1.9, w.z + w.nz * 0.42); // proud of the pilasters
        g.rotation.y = Math.atan2(w.nx, w.nz);
        g.traverse((o) => o.layers.set(LAYERS.WORLD));
        scene.add(g);
        it.relief = relief;
        it.pos = { x: w.x + w.nx * 1.6, z: w.z + w.nz * 1.6 };
        world.colliders.circles.push({ x: w.x + w.nx * 0.2, z: w.z + w.nz * 0.2, r: 0.1 });
      } else if (type === 'keeper') {
        // slumped against the nearest wall, facing the fire
        const w = walls[(i + 1) % Math.max(1, walls.length)] || { x: room.cx + room.w / 2 - 0.8, z: room.cz, nx: -1, nz: 0 };
        const off = (i % 2 ? 1 : -1) * Math.min(2.5, (w.nx === 0 ? room.w : room.d) / 2 - 2);
        const x = w.x + w.nx * 0.6 + (w.nx === 0 ? off : 0), z = w.z + w.nz * 0.6 + (w.nx === 0 ? 0 : off);
        const body = new THREE.Mesh(buildKeeper('sit', { lantern: true, tone: 0.32 }), worldMat);
        body.position.set(x, FLOOR_Y, z);
        body.rotation.y = Math.atan2(w.nx, w.nz);
        body.layers.set(LAYERS.WORLD);
        scene.add(body);
        // the journal, pale in the dark
        const book = new THREE.Mesh(finalize(new THREE.BoxGeometry(0.28, 0.04, 0.2), { tone: 0.95, gloss: 0.05 }), worldMat);
        book.position.set(x + w.nx * 0.75, 0.05, z + w.nz * 0.75);
        book.rotation.y = body.rotation.y + 0.4;
        book.layers.set(LAYERS.WORLD);
        scene.add(book);
        it.pos = { x: x + w.nx * 1.2, z: z + w.nz * 1.2 };
        world.colliders.circles.push({ x, z, r: 0.45 });
      } else {
        // echo: kneeling shadow keepers around the fire, invisible until it catches
        it.figures = [];
        const n = 3;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.6;
          const mat0 = createCreatureMaterial();
          const f = new THREE.Mesh(buildKeeper(k === 2 ? 'stand' : 'kneel'), mat0);
          f.position.set(b.pos.x + Math.cos(a) * 1.8, FLOOR_Y, b.pos.z + Math.sin(a) * 1.8);
          f.rotation.y = Math.atan2(b.pos.x - f.position.x, b.pos.z - f.position.z);
          f.layers.set(LAYERS.WORLD);
          f.visible = false;
          scene.add(f);
          it.figures.push({ mesh: f, mat: mat0, a, baseYaw: f.rotation.y });
        }
        it.pos = { x: b.pos.x + 2.4, z: b.pos.z };
      }
      const label = type === 'mural' ? 'study the mural' : type === 'keeper' ? 'read the journal' : 'remember what the fire showed';
      interactions.add({
        x: it.pos.x, z: it.pos.z, radius: type === 'echo' ? 3.2 : 2.4, hold: 0.25, priority: 0.6,
        label: () => `E  —  ${label}`,
        enabled: () => b.lit && it.t > (type === 'echo' ? 3 : 0.8),
        onComplete: () => { it.read = true; plates.show(beat); },
      });
      this.items.push(it);
    });

    events.on('beaconLit', ({ index }) => {
      const it = this.items.find((x) => x.beacon.index === index);
      if (!it) return;
      it.t = 0;
      events.emit('storyWake', { type: it.type, title: it.beat.title, x: it.beacon.pos.x, z: it.beacon.pos.z });
    });
  }

  update(dt, t) {
    const cr = settings.creatures;
    for (const it of this.items) {
      if (it.t < 0) continue;
      it.t += dt;
      if (it.relief) {
        // the relief surfaces out of the stone as the fire takes
        const k = Math.min(1, it.t / 2.5);
        it.relief.scale.z = 0.02 + k * k * (3 - 2 * k) * 0.98;
      }
      if (it.figures) {
        // fade in, replay (turn toward you, reach), burn away
        for (const f of it.figures) {
          f.mesh.visible = it.t < 9;
          const u = f.mat.uniforms;
          u.uRim.value.set(cr.rimPower, cr.rimThreshold, cr.rimBase + 0.4);
          const appear = Math.min(1, it.t / 1.2);
          const burn = Math.max(0, (it.t - 6.5) / 2.2);
          u.uDissolve.value = Math.max(1 - appear, burn);
          u.uCharge.value = 0.4 + 0.3 * Math.sin(t * 3 + f.a);
          const turn = Math.min(1, Math.max(0, (it.t - 2) / 2));
          f.mesh.rotation.y = f.baseYaw + turn * (f.a > 3 ? 1.2 : -0.5);
          f.mesh.position.y = FLOOR_Y + Math.sin(Math.min(it.t, 6) * 0.8) * 0.05;
        }
      }
    }
  }
}
