// The drowned cathedral: one procedurally built nave, flooded to the knees.
//
//   z = +6   entrance wall + steps rising out of the water (player starts at z = 3)
//   z = 1 .. -23   five bays of clustered piers (x = ±4.5), some broken
//   z = -24.2 .. -26.6   stairs up out of the water to the apse platform
//   z = -34  apse wall with a great blind arch; altar + the main beacon
//
// Returns merged geometry plus gameplay-relevant data (colliders, walkable
// boxes, drip sources, beacon/creature anchors) so systems can query the space.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import {
  mat, finalize, mergeChunked, limb, ball, archBandShape, spandrelShape, archHolePath, extrude, vaultGeometry, pointedArch,
} from './geo.js';

export const LAYOUT = {
  waterLevel: 0,
  floorY: -0.22,
  halfWidth: 8.6,
  naveHalf: 4.5,
  zEntrance: 6,
  zApse: -34,
  pillarZ: [1, -5, -11, -17, -23],
  pillarH: 4.4,
  vaultSpring: 10.0,
  aisleCeil: 7.3,
  platformTop: 0.72,
  platformZ: -26.6,
};

const STONE = { tone: 0.78, gloss: 0.12 };
const DARK_STONE = { tone: 0.55, gloss: 0.2 };
const IRON = { tone: 0.6, gloss: 0.75 };
const COAL = { tone: 0.22, gloss: 0.3 };

export function buildCathedral() {
  const rand = mulberry32(7);
  const L = LAYOUT;
  const parts = [];
  const add = (g, opts) => parts.push(finalize(g, opts));

  const colliders = { circles: [], boxes: [] };
  const walkables = []; // {minX,maxX,minZ,maxZ,top}
  const dripSources = [];
  const beacons = [];
  const chainAnchors = [];

  const boxCollider = (cx, cz, hx, hz, top = 99) => colliders.boxes.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, top });

  // ---------------------------------------------------------------- floor (under water, closes the shadow cube)
  add(new THREE.BoxGeometry(L.halfWidth * 2 + 2, 0.3, L.zEntrance - L.zApse + 2), { ...DARK_STONE, matrix: mat([0, L.floorY - 0.15, (L.zEntrance + L.zApse) / 2]) });

  // Broken floor slabs jutting out of the water.
  const slabs = [[-2.2, -2.5, 0.25, 0.1], [2.8, -13.6, -0.3, 0.18], [-1.5, -20.5, 0.2, -0.12], [6.5, 2.5, 0.12, 0.2], [-6.8, -9.5, -0.2, 0.15]];
  for (const [x, z, rx, rz] of slabs) {
    const g = new THREE.BoxGeometry(1.6 + rand(), 0.22, 1.2 + rand() * 0.8, 4, 1, 3);
    add(g, { ...STONE, matrix: mat([x, 0.02, z], [rx, rand() * 3, rz]), disp: 0.05, dispScale: 2.5, seed: 3 });
  }

  // ---------------------------------------------------------------- outer walls with blind arches
  const wallLen = L.zEntrance - L.zApse;
  const wallH = 8.2;
  const wallT = 0.8;
  for (const side of [-1, 1]) {
    // shape x = -(world z), so z from zApse..zEntrance maps to x from -zApse..-zEntrance
    const x0 = -L.zEntrance, x1 = -L.zApse;
    const shape = new THREE.Shape([
      new THREE.Vector2(x0, -0.5), new THREE.Vector2(x1, -0.5), new THREE.Vector2(x1, wallH), new THREE.Vector2(x0, wallH),
    ]);
    const bays = [-2, -8, -14, -20];
    for (const zc of bays) shape.holes.push(archHolePath(-zc, 0.9, 2.4, 2.8, 0.85));
    const g = extrude(shape, wallT);
    g.rotateY(Math.PI / 2);
    g.translate(side * (L.halfWidth + wallT / 2), 0, 0);
    add(g, STONE);
    // recess back panels + sills
    for (const zc of bays) {
      add(new THREE.BoxGeometry(0.2, 5.0, 2.6), { ...DARK_STONE, matrix: mat([side * (L.halfWidth + wallT + 0.1), 3.0, zc]) });
      add(new THREE.BoxGeometry(0.5, 0.18, 2.8), { ...STONE, matrix: mat([side * (L.halfWidth + 0.1), 0.85, zc]) });
    }
    // pilasters between bays
    for (const zc of [1, -5, -11, -17, -23]) {
      add(new THREE.BoxGeometry(0.5, wallH, 0.7, 1, 6, 1), { ...STONE, matrix: mat([side * (L.halfWidth - 0.2), wallH / 2 - 0.5, zc]), disp: 0.04, dispScale: 1.5, seed: 9 });
    }
  }

  // ---------------------------------------------------------------- end walls
  const endW = L.halfWidth * 2 + wallT * 2;
  const endH = 17.0;
  {
    // Entrance wall with a doorway recess.
    const s = new THREE.Shape([
      new THREE.Vector2(-endW / 2, -0.5), new THREE.Vector2(endW / 2, -0.5), new THREE.Vector2(endW / 2, endH), new THREE.Vector2(-endW / 2, endH),
    ]);
    s.holes.push(archHolePath(0, 0.62, 3.0, 2.6, 0.8));
    s.holes.push(archHolePath(0, 7.5, 3.6, 2.2, 0.9));
    const g = extrude(s, wallT);
    g.translate(0, 0, L.zEntrance + wallT / 2);
    add(g, STONE);
    add(new THREE.BoxGeometry(3.4, 6.5, 0.3), { ...DARK_STONE, matrix: mat([0, 3.6, L.zEntrance + 2.4]) });
    add(new THREE.BoxGeometry(0.3, 6.5, 1.6), { ...DARK_STONE, matrix: mat([-1.65, 3.6, L.zEntrance + 1.55]) });
    add(new THREE.BoxGeometry(0.3, 6.5, 1.6), { ...DARK_STONE, matrix: mat([1.65, 3.6, L.zEntrance + 1.55]) });
    add(new THREE.BoxGeometry(4.0, 6.0, 0.3), { ...DARK_STONE, matrix: mat([0, 10.0, L.zEntrance + 1.2]) });
    // rubble choking the doorway
    for (let i = 0; i < 7; i++) {
      const g2 = new THREE.DodecahedronGeometry(0.35 + rand() * 0.45, 0);
      add(g2, { ...STONE, flat: true, matrix: mat([(rand() - 0.5) * 2.4, 0.6 + rand() * 0.8, L.zEntrance + 1.2 + rand() * 0.9], [rand() * 3, rand() * 3, rand() * 3]) });
    }
    // entrance steps rising out of the water
    const steps = [[0.14, 4.5], [0.34, 5.1], [0.56, 5.6]];
    for (const [top, z] of steps) {
      add(new THREE.BoxGeometry(6, top - L.floorY, 0.62, 6, 1, 1), { ...STONE, matrix: mat([0, (top + L.floorY) / 2, z]), disp: 0.03, dispScale: 2, seed: 4 });
      walkables.push({ minX: -3, maxX: 3, minZ: z - 0.31, maxZ: z + 0.31, top });
    }
  }
  {
    // Apse wall with a great blind arch (the "rose" recess).
    const s = new THREE.Shape([
      new THREE.Vector2(-endW / 2, -0.5), new THREE.Vector2(endW / 2, -0.5), new THREE.Vector2(endW / 2, endH), new THREE.Vector2(-endW / 2, endH),
    ]);
    s.holes.push(archHolePath(0, 1.6, 5.2, 4.2, 0.75));
    const g = extrude(s, wallT);
    g.translate(0, 0, L.zApse - wallT / 2);
    add(g, STONE);
    add(new THREE.BoxGeometry(5.6, 9.5, 0.3), { ...DARK_STONE, matrix: mat([0, 6.2, L.zApse - wallT - 0.15]) });
    // tracery mullions in the recess
    for (const x of [-1.3, 0, 1.3]) add(new THREE.BoxGeometry(0.16, 6.8, 0.16), { ...STONE, matrix: mat([x, 5.0, L.zApse - 0.5]) });
    add(new THREE.TorusGeometry(1.15, 0.09, 6, 28), { ...STONE, matrix: mat([0, 8.2, L.zApse - 0.5]) });
  }

  // ---------------------------------------------------------------- apse platform, stairs, altar
  {
    const pz0 = L.zApse, pz1 = L.platformZ;
    const depth = pz1 - pz0;
    add(new THREE.BoxGeometry(L.halfWidth * 2, L.platformTop - L.floorY, depth, 8, 1, 4), { ...STONE, matrix: mat([0, (L.platformTop + L.floorY) / 2, (pz0 + pz1) / 2]), disp: 0.02, dispScale: 1.5 });
    walkables.push({ minX: -L.halfWidth, maxX: L.halfWidth, minZ: pz0, maxZ: pz1, top: L.platformTop });
    const tops = [0.54, 0.36, 0.18, 0.02];
    tops.forEach((top, i) => {
      const z = pz1 + 0.3 + i * 0.6;
      add(new THREE.BoxGeometry(9, top - L.floorY, 0.6, 8, 1, 1), { ...STONE, matrix: mat([0, (top + L.floorY) / 2, z]), disp: 0.025, dispScale: 2.2, seed: 5 + i });
      walkables.push({ minX: -4.5, maxX: 4.5, minZ: z - 0.3, maxZ: z + 0.3, top });
    });
    // altar
    const az = -30.4;
    add(new THREE.BoxGeometry(2.6, 1.0, 1.2, 3, 2, 2), { ...STONE, matrix: mat([0, L.platformTop + 0.5, az]), disp: 0.03 });
    add(new THREE.BoxGeometry(3.0, 0.16, 1.5), { ...STONE, matrix: mat([0, L.platformTop + 1.08, az]) });
    boxCollider(0, az, 1.5, 0.75);
    // A cracked slab leaning on the altar
    add(new THREE.BoxGeometry(1.2, 0.12, 2.0), { ...STONE, matrix: mat([1.9, L.platformTop + 0.45, az + 0.2], [0.1, 0.4, 0.55]) });
  }

  // ---------------------------------------------------------------- clustered piers
  const broken = new Map([['4.5,-11', 2.3], ['-4.5,-17', 3.1], ['4.5,-23', 1.4]]);
  const pierTop = (x, z) => broken.get(`${x},${z}`) ?? L.pillarH;
  for (const z of L.pillarZ) {
    for (const x of [-L.naveHalf, L.naveHalf]) {
      const h = pierTop(x, z);
      const isBroken = h < L.pillarH;
      const seed = Math.round(z * 13 + x * 7);
      // plinth (half drowned)
      add(new THREE.BoxGeometry(1.25, 0.7, 1.25, 2, 1, 2), { ...STONE, matrix: mat([x, -0.15, z], [0, Math.PI / 4, 0]), disp: 0.03 });
      add(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 16), { ...STONE, matrix: mat([x, 0.35, z]) });
      // core shaft + four attached shafts (gothic clustered pier)
      const core = new THREE.CylinderGeometry(0.42, 0.44, h, 16, Math.ceil(h * 2.5), false);
      if (isBroken) {
        // jagged fracture: drop and scatter the top ring
        const p = core.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (p.getY(i) > h / 2 - 0.01) {
            const a = Math.atan2(p.getZ(i), p.getX(i));
            p.setY(i, h / 2 - (0.15 + 0.5 * Math.abs(Math.sin(a * 2.5 + seed))) * (0.6 + rand() * 0.6));
          }
        }
      }
      add(core, { ...STONE, matrix: mat([x, 0.5 + h / 2, z]), disp: 0.035, dispScale: 1.8, seed });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const sh = isBroken ? h * (0.55 + rand() * 0.4) : h;
        add(new THREE.CylinderGeometry(0.13, 0.14, sh, 8, Math.ceil(sh * 2)), {
          ...STONE, matrix: mat([x + Math.cos(a) * 0.45, 0.5 + sh / 2, z + Math.sin(a) * 0.45]), disp: 0.02, dispScale: 2.5, seed: seed + k,
        });
      }
      if (!isBroken) {
        // capital + abacus
        add(new THREE.CylinderGeometry(0.72, 0.5, 0.45, 16), { ...STONE, matrix: mat([x, 0.5 + h + 0.22, z]) });
        add(new THREE.BoxGeometry(1.5, 0.2, 1.5), { ...STONE, matrix: mat([x, 0.5 + h + 0.55, z]) });
      } else {
        // fallen drums & rubble at the foot
        const dir = x > 0 ? -1 : 1;
        const drum = new THREE.CylinderGeometry(0.42, 0.42, 1.4, 14, 3);
        add(drum, { ...STONE, matrix: mat([x + dir * 1.5, 0.12, z + 1.0], [Math.PI / 2, 0.3 * dir, 0.2]), disp: 0.04, seed: seed + 9 });
        boxCollider(x + dir * 1.5, z + 1.0, 0.6, 0.8, 0.5);
        for (let i = 0; i < 6; i++) {
          const r = 0.18 + rand() * 0.35;
          add(new THREE.DodecahedronGeometry(r, 0), {
            ...STONE, flat: true, matrix: mat([x + dir * (0.6 + rand() * 1.6), r * 0.3, z + (rand() - 0.5) * 2.5], [rand() * 3, rand() * 3, rand() * 3]),
          });
        }
      }
      colliders.circles.push({ x, z, r: 0.85 });
    }
  }

  // ---------------------------------------------------------------- arcades (arch bands + spandrel walls)
  const bay = 6;
  const arcSpan = bay - 0.9;
  const arcF = 0.7;
  const arcT = 0.42;
  const spring = L.pillarH + 0.5 + 0.65; // top of abacus
  const spandrelH = L.vaultSpring - spring;
  for (const x of [-L.naveHalf, L.naveHalf]) {
    for (let i = 0; i < L.pillarZ.length - 1; i++) {
      const za = L.pillarZ[i], zb = L.pillarZ[i + 1];
      const zc = (za + zb) / 2;
      const brokenA = pierTop(x, za) < L.pillarH, brokenB = pierTop(x, zb) < L.pillarH;
      const place = (g) => { g.rotateY(Math.PI / 2); g.translate(x, spring, zc); return g; };
      if (brokenA && brokenB) continue;
      if (brokenA || brokenB) {
        // only a stump of the arch survives, springing from the intact pier
        const g = extrude(archBandShape(arcSpan, arcF, arcT, 0.28 + rand() * 0.12, rand), 0.75);
        if (brokenA) g.rotateY(Math.PI); // by default the stump springs from the A side
        add(place(g), { ...STONE, disp: 0.03, dispScale: 2.2, seed: i });
        // ruined spandrel stub above the intact pier
        const stub = new THREE.BoxGeometry(0.5, spandrelH * 0.55, 1.4, 1, 3, 1);
        add(stub, { ...STONE, matrix: mat([x, spring + spandrelH * 0.28, brokenA ? zb + 0.8 : za - 0.8]), disp: 0.06, dispScale: 1.5 });
        continue;
      }
      add(place(extrude(archBandShape(arcSpan, arcF, arcT, 1, rand), 0.75)), { ...STONE, disp: 0.02, dispScale: 2.2, seed: i + 30 });
      const jag = i === 0 && x < 0 ? 1.6 : 0;
      add(place(extrude(spandrelShape(bay, spandrelH, arcSpan, arcF, arcT, jag, rand), 0.45)), { ...STONE });
      // drip from the arch keystone
      if (rand() > 0.35) dripSources.push({ x, y: spring + pointedArch(arcSpan, arcF).rise(0) - 0.05, z: zc, period: 2.5 + rand() * 4 });
    }
  }
  // spandrel walls beyond the first and last bays (to the end walls)
  for (const x of [-L.naveHalf, L.naveHalf]) {
    add(new THREE.BoxGeometry(0.45, L.vaultSpring + 0.5, L.zEntrance - L.pillarZ[0] - 0.5), { ...STONE, matrix: mat([x, (L.vaultSpring + 0.5) / 2 - 0.5 + 0.0, (L.zEntrance + L.pillarZ[0] + 0.5) / 2]) });
    add(new THREE.BoxGeometry(0.45, L.vaultSpring - L.floorY, L.pillarZ[4] - L.zApse - 0.5), { ...STONE, matrix: mat([x, (L.vaultSpring + L.floorY) / 2, (L.pillarZ[4] - 0.5 + L.zApse) / 2]) });
    boxCollider(x, (L.zEntrance + L.pillarZ[0] + 0.5) / 2, 0.3, (L.zEntrance - L.pillarZ[0] - 0.5) / 2);
    boxCollider(x, (L.pillarZ[4] - 0.5 + L.zApse) / 2, 0.3, (L.pillarZ[4] - L.zApse - 0.5) / 2);
  }

  // ---------------------------------------------------------------- nave vault + transverse ribs
  const vaultSpan = L.naveHalf * 2;
  const vaultF = 0.7;
  {
    const g = vaultGeometry(vaultSpan, vaultF, L.zApse, L.zEntrance, 36, 30);
    g.translate(0, L.vaultSpring, 0);
    add(g, { ...DARK_STONE });
    L.vaultApex = L.vaultSpring + pointedArch(vaultSpan, vaultF).rise(0);
    for (const z of L.pillarZ) {
      const tEnd = z === -11 ? 0.42 : 1;
      const rib = extrude(archBandShape(vaultSpan - 0.3, vaultF, 0.35, tEnd, rand, 32), 0.45);
      rib.translate(0, L.vaultSpring - 0.05, z);
      add(rib, { ...STONE });
    }
    // longitudinal ridge rib
    add(new THREE.BoxGeometry(0.3, 0.3, L.zEntrance - L.zApse), { ...STONE, matrix: mat([0, L.vaultApex - 0.15, (L.zEntrance + L.zApse) / 2]) });
    // high drips from the vault (long falls catch the light on the way down)
    dripSources.push({ x: -1.2, y: L.vaultApex - 0.6, z: -8, period: 5 });
    dripSources.push({ x: 0.8, y: L.vaultApex - 0.5, z: -14, period: 6.5 });
    dripSources.push({ x: 0.2, y: L.vaultApex - 0.5, z: -2, period: 7 });
    chainAnchors.push({ x: -0.6, y: L.vaultApex - 0.3, z: -3.5, bottom: 3.6, cage: false });
    chainAnchors.push({ x: 1.1, y: L.vaultApex - 0.4, z: -9.5, bottom: 3.4, cage: true });
    chainAnchors.push({ x: -1.4, y: L.vaultApex - 0.6, z: -15.5, bottom: 2.4, cage: false });
    chainAnchors.push({ x: 0.3, y: L.vaultApex - 0.3, z: -20.5, bottom: 5.0, cage: false });
  }

  // ---------------------------------------------------------------- aisle ceilings + ribs + dripstones
  for (const side of [-1, 1]) {
    const cx = side * (L.naveHalf + L.halfWidth) / 2;
    const w = L.halfWidth - L.naveHalf;
    add(new THREE.BoxGeometry(w + 0.4, 0.5, L.zEntrance - L.zApse), { ...DARK_STONE, matrix: mat([cx, L.aisleCeil + 0.25, (L.zEntrance + L.zApse) / 2]) });
    for (const z of L.pillarZ) {
      if (pierTop(side * L.naveHalf, z) < L.pillarH) continue;
      const rib = extrude(archBandShape(w - 0.6, 0.75, 0.25, 1, rand, 20), 0.35);
      const ribSpring = L.aisleCeil - pointedArch(w - 0.6, 0.75).rise(0.25);
      rib.rotateY(0);
      rib.translate(cx, ribSpring, z);
      add(rib, { ...STONE });
    }
    for (let i = 0; i < 4; i++) {
      const z = -1 - i * 6 + (rand() - 0.5) * 2;
      const x = cx + (rand() - 0.5) * 2;
      // dripstone cluster
      for (let k = 0; k < 3; k++) {
        const h = 0.25 + rand() * 0.7;
        add(new THREE.ConeGeometry(0.05 + rand() * 0.08, h, 6), { ...DARK_STONE, gloss: 0.6, matrix: mat([x + (rand() - 0.5) * 0.5, L.aisleCeil - h / 2, z + (rand() - 0.5) * 0.5], [Math.PI, 0, 0]) });
      }
      dripSources.push({ x, y: L.aisleCeil - 0.6, z, period: 1.6 + rand() * 3 });
      if (i === 1 || i === 3) chainAnchors.push({ x: x + 0.4, y: L.aisleCeil, z: z - 1.2, bottom: 2.2 + rand() * 1.2, cage: false });
    }
  }

  // ---------------------------------------------------------------- beacons (ancient, unlit)
  const tripod = (bx, bz, seed) => {
    const legs = 3;
    const top = 1.35;
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * Math.PI * 2 + seed;
      add(limb([bx + Math.cos(a) * 0.42, L.floorY, bz + Math.sin(a) * 0.42], [bx + Math.cos(a) * 0.14, top, bz + Math.sin(a) * 0.14], 0.035, 0.028, 6), { ...IRON });
      // claw foot
      add(new THREE.ConeGeometry(0.06, 0.18, 5), { ...IRON, flat: true, matrix: mat([bx + Math.cos(a) * 0.45, 0.05, bz + Math.sin(a) * 0.45], [0, 0, Math.PI]) });
    }
    add(new THREE.TorusGeometry(0.24, 0.025, 6, 20), { ...IRON, matrix: mat([bx, 0.75, bz], [Math.PI / 2, 0, 0]) });
    const prof = [[0.06, 0], [0.2, 0.06], [0.36, 0.16], [0.46, 0.28], [0.5, 0.32], [0.47, 0.33], [0.4, 0.22], [0.2, 0.1], [0.05, 0.06]].map(([r, y]) => new THREE.Vector2(r, y));
    add(new THREE.LatheGeometry(prof, 18), { ...IRON, matrix: mat([bx, top - 0.05, bz]) });
    // crown of bent spikes
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(limb([bx + Math.cos(a) * 0.46, top + 0.26, bz + Math.sin(a) * 0.46], [bx + Math.cos(a) * 0.36, top + 0.62 + rand() * 0.15, bz + Math.sin(a) * 0.36], 0.022, 0.004, 5), { ...IRON });
    }
    // cold coals
    for (let i = 0; i < 6; i++) add(new THREE.IcosahedronGeometry(0.08 + rand() * 0.06, 0), { ...COAL, flat: true, matrix: mat([bx + (rand() - 0.5) * 0.4, top + 0.2, bz + (rand() - 0.5) * 0.4], [rand() * 3, rand() * 3, 0]) });
    colliders.circles.push({ x: bx, z: bz, r: 0.6 });
    beacons.push({ x: bx, y: top + 0.25, z: bz, kind: 'tripod' });
  };
  tripod(-6.6, -13.8, 0.3);
  tripod(6.6, -2.2, 1.1);
  {
    // Great beacon on the apse platform: stone pedestal + iron bowl.
    const bx = 0, bz = -32.2, base = L.platformTop;
    add(new THREE.CylinderGeometry(0.75, 0.85, 0.3, 8), { ...STONE, flat: true, matrix: mat([bx, base + 0.15, bz]) });
    add(new THREE.CylinderGeometry(0.42, 0.55, 1.5, 8, 4), { ...STONE, flat: true, matrix: mat([bx, base + 1.05, bz]), disp: 0.02 });
    add(new THREE.CylinderGeometry(0.62, 0.45, 0.25, 8), { ...STONE, flat: true, matrix: mat([bx, base + 1.9, bz]) });
    const prof = [[0.1, 0], [0.45, 0.08], [0.78, 0.26], [0.92, 0.44], [0.98, 0.5], [0.93, 0.52], [0.8, 0.34], [0.4, 0.14], [0.08, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
    add(new THREE.LatheGeometry(prof, 24), { ...IRON, matrix: mat([bx, base + 2.0, bz]) });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(limb([bx + Math.cos(a) * 0.95, base + 2.45, bz + Math.sin(a) * 0.95], [bx + Math.cos(a) * 1.25, base + 3.2, bz + Math.sin(a) * 1.25], 0.05, 0.005, 6), { ...IRON });
    }
    for (let i = 0; i < 12; i++) add(new THREE.IcosahedronGeometry(0.1 + rand() * 0.1, 0), { ...COAL, flat: true, matrix: mat([bx + (rand() - 0.5) * 1.0, base + 2.4, bz + (rand() - 0.5) * 1.0], [rand() * 3, rand() * 3, 0]) });
    colliders.circles.push({ x: bx, z: bz, r: 1.0 });
    beacons.push({ x: bx, y: base + 2.45, z: bz, kind: 'great' });
  }

  // ---------------------------------------------------------------- scattered rubble & a toppled column in the nave
  add(new THREE.CylinderGeometry(0.42, 0.42, 3.6, 14, 6), { ...STONE, matrix: mat([-1.9, 0.18, -9.0], [0, 1.1, Math.PI / 2]), disp: 0.04, seed: 77 });
  boxCollider(-1.9, -9.0, 1.6, 0.9, 0.6);
  for (let i = 0; i < 18; i++) {
    const x = (rand() - 0.5) * 15, z = 3 - rand() * 27;
    if (Math.abs(Math.abs(x) - L.naveHalf) < 1.0) continue;
    const r = 0.12 + rand() * 0.3;
    add(new THREE.DodecahedronGeometry(r, 0), { ...STONE, flat: true, matrix: mat([x, r * 0.2, z], [rand() * 3, rand() * 3, rand() * 3]) });
  }

  return { geometries: mergeChunked(parts), colliders, walkables, dripSources, beacons, chainAnchors };
}
