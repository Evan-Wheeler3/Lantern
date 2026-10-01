// Turns a Dungeon grid into geometry + gameplay data (colliders, walkables, drips,
// chains, beacon fire positions, the exit door). All static pieces are merged into
// spatial chunks so every pass (especially the 6 shadow cube faces) can cull.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { SOLID, ROOM, CORRIDOR } from './Dungeon.js';
import { mat, finalize, mergeChunked, archBandShape, extrude, vaultGeometry, pointedArch } from './geo.js';
import {
  FLOOR_Y, STONE, DARK_STONE, pier, cryptColumn, rubble, sarcophagus, font, tripodBeacon, greatBeacon,
} from './props.js';

const WALL_T = 0.6;
const MAX_RUN = 8;
const VAULT_F = 0.7;

export function buildDungeon(dg) {
  const rand = mulberry32(dg.seed * 7 + 3);
  const parts = [];
  const add = (g, opts) => parts.push(finalize(g, opts));
  const out = {
    colliders: { circles: [], boxes: [] },
    walkables: [],
    drips: [],
    chains: [],
    beaconFires: [],   // per beacon index: { pos, room, kind }
    door: null,
  };
  const C = out.colliders;
  const W = dg.W, H = dg.H;
  const isHall = (i, j) => { const r = dg.roomOf[dg.idx(i, j)]; return r >= 0 && dg.rooms[r].kind === 'hall' && dg.type(i, j) === ROOM; };
  const ceilAt = (i, j) => dg.ceil[dg.idx(i, j)];

  // ------------------------------------------------------------------ walls & lintels
  // Edges are collected per line, then merged into runs of at most MAX_RUN cells.
  const runs = new Map();
  const push = (key, k, info) => {
    if (!runs.has(key)) runs.set(key, { info, ks: [] });
    runs.get(key).ks.push(k);
  };
  const doorEdges = new Map();
  for (const axis of ['x', 'z']) {
    // axis 'x': edge between (i,j) and (i+1,j) at x = const;  'z': between (i,j) and (i,j+1)
    for (let a = -1; a < (axis === 'x' ? W : H); a++) {
      for (let k = 0; k < (axis === 'x' ? H : W); k++) {
        const [i0, j0, i1, j1] = axis === 'x' ? [a, k, a + 1, k] : [k, a, k, a + 1];
        const f0 = dg.isFloor(i0, j0), f1 = dg.isFloor(i1, j1);
        if (f0 === f1 && !f0) continue;
        if (f0 !== f1) {
          const [fi, fj] = f0 ? [i0, j0] : [i1, j1];
          const side = f0 ? 1 : -1; // direction from floor toward solid
          const top = ceilAt(fi, fj) + (isHall(fi, fj) ? 0 : 0.4);
          push(`w|${axis}|${a}|${side}|${top}`, k, { axis, a, side, y0: -0.6, y1: top });
        } else {
          const c0 = ceilAt(i0, j0), c1 = ceilAt(i1, j1);
          if (Math.abs(c0 - c1) > 0.01) {
            const hiHall = c1 > c0 ? isHall(i1, j1) : isHall(i0, j0);
            push(`l|${axis}|${a}|${Math.min(c0, c1)}|${Math.max(c0, c1)}`, k, {
              axis, a, side: 0, y0: Math.min(c0, c1) - 0.05, y1: Math.max(c0, c1) + (hiHall ? 0 : 0.4),
            });
          }
          const t0 = dg.type(i0, j0), t1 = dg.type(i1, j1);
          if (t0 !== t1) {
            const roomSide = t0 === ROOM ? -1 : 1; // direction from edge toward the room
            const key = `${axis}|${a}`;
            if (!doorEdges.has(key)) doorEdges.set(key, { axis, a, roomSide, ks: [] });
            doorEdges.get(key).ks.push(k);
          }
        }
      }
    }
  }
  const splitRuns = (ks) => {
    ks.sort((p, q) => p - q);
    const res = [];
    let s = ks[0], prev = ks[0];
    for (let n = 1; n <= ks.length; n++) {
      const k = ks[n];
      if (k === prev + 1 && k - s < MAX_RUN) { prev = k; continue; }
      res.push([s, prev]);
      s = prev = k;
    }
    return res;
  };
  const edgeCoord = (axis, a) => (axis === 'x' ? dg.cellX(a) + 0.5 : dg.cellZ(a) + 0.5);
  const alongCoord = (axis, k) => (axis === 'x' ? dg.cellZ(k) : dg.cellX(k));

  for (const { info, ks } of runs.values()) {
    for (const [s, e] of splitRuns(ks)) {
      const len = e - s + 1;
      const h = info.y1 - info.y0;
      const e0 = edgeCoord(info.axis, info.a) + info.side * WALL_T / 2;
      const mid = (alongCoord(info.axis, s) + alongCoord(info.axis, e)) / 2;
      const g = new THREE.BoxGeometry(WALL_T, h, len + (info.side ? WALL_T : 0), 1, Math.max(1, Math.round(h / 1.5)), Math.max(1, Math.round(len / 1.5)));
      if (info.axis === 'z') g.rotateY(Math.PI / 2);
      const pos = info.axis === 'x' ? [e0, (info.y0 + info.y1) / 2, mid] : [mid, (info.y0 + info.y1) / 2, e0];
      add(g, { ...STONE, matrix: mat(pos), disp: 0.03, dispScale: 1.4, seed: s + info.a * 31 });
    }
  }

  // ------------------------------------------------------------------ flat ceilings (greedy)
  const done = new Uint8Array(W * H);
  const flat = (i, j, c) => dg.isFloor(i, j) && !isHall(i, j) && !done[dg.idx(i, j)] && Math.abs(ceilAt(i, j) - c) < 0.01;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!dg.isFloor(i, j) || isHall(i, j) || done[dg.idx(i, j)]) continue;
      const c = ceilAt(i, j);
      let w = 1;
      while (w < MAX_RUN && flat(i + w, j, c)) w++;
      let d = 1;
      outer: while (d < MAX_RUN) {
        for (let k = 0; k < w; k++) if (!flat(i + k, j + d, c)) break outer;
        d++;
      }
      for (let jj = j; jj < j + d; jj++) for (let ii = i; ii < i + w; ii++) done[dg.idx(ii, jj)] = 1;
      add(new THREE.BoxGeometry(w + 0.02, 0.4, d + 0.02), {
        ...DARK_STONE, matrix: mat([dg.cellX(i) - 0.5 + w / 2, c + 0.2, dg.cellZ(j) - 0.5 + d / 2]),
      });
    }
  }

  // ------------------------------------------------------------------ doorway arches + jambs
  for (const de of doorEdges.values()) {
    for (const [s, e] of splitRuns(de.ks)) {
      const len = e - s + 1;
      if (len < 2 || len > 5) continue;
      const span = len - 0.7;
      const arch = pointedArch(span, 0.65);
      const spring = 4.2 - arch.rise(0.28) - 0.05;
      const ec = edgeCoord(de.axis, de.a);
      const a0 = alongCoord(de.axis, s) - 0.5, a1 = alongCoord(de.axis, e) + 0.5;
      const mid = (a0 + a1) / 2;
      const g = extrude(archBandShape(span, 0.65, 0.28, 1, rand, 16), 0.7);
      if (de.axis === 'x') g.rotateY(Math.PI / 2);
      g.translate(de.axis === 'x' ? ec : mid, spring, de.axis === 'x' ? mid : ec);
      add(g, { ...STONE, disp: 0.02, dispScale: 2 });
      for (const end of [a0 + 0.2, a1 - 0.2]) {
        const jg = new THREE.BoxGeometry(0.4, spring - FLOOR_Y + 0.3, 0.75, 1, 3, 1);
        if (de.axis === 'z') jg.rotateY(Math.PI / 2);
        const p = de.axis === 'x' ? [ec, (spring + FLOOR_Y) / 2, end] : [end, (spring + FLOOR_Y) / 2, ec];
        add(jg, { ...STONE, matrix: mat(p), disp: 0.02 });
        C.circles.push({ x: p[0], z: p[2], r: 0.28 });
      }
    }
  }

  // ------------------------------------------------------------------ corridor ribs
  for (const seg of dg.corridors) {
    const [i0, j0] = seg.a, [i1, j1] = seg.b;
    const along = i0 !== i1 ? 'x' : 'z';
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
    for (let t = 2; t < n - 1; t += 4) {
      const ci = along === 'x' ? i0 + Math.sign(i1 - i0) * t : i0;
      const cj = along === 'z' ? j0 + Math.sign(j1 - j0) * t : j0;
      if (dg.type(ci, cj) !== CORRIDOR) continue;
      // only where both side walls exist (a proper hallway, not a junction)
      const s1 = along === 'x' ? dg.type(ci, cj - 2) : dg.type(ci - 2, cj);
      const s2 = along === 'x' ? dg.type(ci, cj + 2) : dg.type(ci + 2, cj);
      if (s1 !== SOLID || s2 !== SOLID) continue;
      const x = dg.cellX(ci), z = dg.cellZ(cj);
      const span = 2.9;
      const spring = 4.2 - pointedArch(span, 0.62).rise(0.2);
      const g = extrude(archBandShape(span, 0.62, 0.2, 1, rand, 14), 0.3);
      if (along === 'x') g.rotateY(Math.PI / 2);
      g.translate(x, spring, z);
      add(g, { ...STONE });
      for (const sgn of [-1, 1]) {
        const pg = new THREE.BoxGeometry(0.16, spring - FLOOR_Y, 0.34);
        if (along === 'z') pg.rotateY(Math.PI / 2);
        const off = sgn * 1.42;
        add(pg, { ...STONE, matrix: mat(along === 'x' ? [x, (spring + FLOOR_Y) / 2, z + off] : [x + off, (spring + FLOOR_Y) / 2, z]) });
      }
      if (rand() < 0.3) out.drips.push({ x: x + (rand() - 0.5), y: 4.1, z: z + (rand() - 0.5), period: 2 + rand() * 4 });
    }
  }

  // ------------------------------------------------------------------ rooms
  for (const room of dg.rooms) dressRoom(dg, room, add, rand, out);

  return { geometries: mergeChunked(parts, 9), ...out };
}

// Which sides of a room are unbroken wall (no hallway entering)? Returns
// [{side:'n'|'s'|'e'|'w', ...}] with the wall line and inward normal.
function solidSides(dg, room) {
  const res = [];
  const check = (cells) => cells.every(([i, j]) => dg.type(i, j) === SOLID);
  const mi = room.i0 + Math.floor(room.w / 2), mj = room.j0 + Math.floor(room.d / 2);
  const span = (c, n) => [-2, -1, 0, 1, 2].map((o) => c + o).filter((v) => v >= 0 && v < n);
  const sides = [
    { side: 'n', cells: span(mi, dg.W).map((i) => [i, room.j0 - 1]), nx: 0, nz: 1, x: room.cx, z: room.cz - room.d / 2 },
    { side: 's', cells: span(mi, dg.W).map((i) => [i, room.j0 + room.d]), nx: 0, nz: -1, x: room.cx, z: room.cz + room.d / 2 },
    { side: 'w', cells: span(mj, dg.H).map((j) => [room.i0 - 1, j]), nx: 1, nz: 0, x: room.cx - room.w / 2, z: room.cz },
    { side: 'e', cells: span(mj, dg.H).map((j) => [room.i0 + room.w, j]), nx: -1, nz: 0, x: room.cx + room.w / 2, z: room.cz },
  ];
  for (const s of sides) if (check(s.cells)) res.push(s);
  return res;
}

function dressRoom(dg, room, add, rand, out) {
  const C = out.colliders;
  const { cx, cz, w, d, ceil } = room;
  const long = room.longAxis;
  const L = long === 'x' ? w : d;     // length along long axis
  const S = long === 'x' ? d : w;     // span across
  // local (u across, v along) -> world
  const P = (u, v) => (long === 'x' ? [cx + v, cz + u] : [cx + u, cz + v]);
  const keepClear = []; // spots that must stay walkable (beacon, door)

  // pilasters along unbroken walls
  const pil = (x, z, alongX) => {
    const g = new THREE.BoxGeometry(alongX ? 0.6 : 0.3, ceil + 0.2, alongX ? 0.3 : 0.6, 1, Math.round(ceil / 1.5), 1);
    add(g, { ...STONE, matrix: mat([x, (ceil + FLOOR_Y) / 2, z]), disp: 0.03 });
  };
  for (let i = room.i0 + 2; i < room.i0 + room.w - 1; i += 4) {
    if (dg.type(i, room.j0 - 1) === SOLID) pil(dg.cellX(i), cz - d / 2 + 0.15, true);
    if (dg.type(i, room.j0 + room.d) === SOLID) pil(dg.cellX(i), cz + d / 2 - 0.15, true);
  }
  for (let j = room.j0 + 2; j < room.j0 + room.d - 1; j += 4) {
    if (dg.type(room.i0 - 1, j) === SOLID) pil(cx - w / 2 + 0.15, dg.cellZ(j), false);
    if (dg.type(room.i0 + room.w, j) === SOLID) pil(cx + w / 2 - 0.15, dg.cellZ(j), false);
  }

  if (room.kind === 'hall') {
    // vault (segmented for culling) + gable ends
    const a0 = (long === 'x' ? cx : cz) - L / 2, a1 = a0 + L;
    for (let s = a0; s < a1 - 0.01; s += 8) {
      const g = vaultGeometry(S, VAULT_F, s, Math.min(s + 8, a1), 24, 8);
      if (long === 'x') { g.rotateY(Math.PI / 2); g.translate(0, ceil, cz); } else g.translate(cx, ceil, 0);
      add(g, { ...DARK_STONE });
    }
    const arch = pointedArch(S, VAULT_F);
    const gable = new THREE.Shape();
    gable.moveTo(-S / 2 - 0.3, 0);
    for (let k = 0; k <= 24; k++) { const [x, y] = arch.at(k / 24, 0); gable.lineTo(x, y + 0.3); }
    gable.lineTo(S / 2 + 0.3, 0);
    for (const end of [a0 - 0.3, a1 + 0.3]) {
      const g = extrude(gable, 0.6);
      if (long === 'x') g.rotateY(Math.PI / 2);
      g.translate(long === 'x' ? end : cx, ceil - 0.05, long === 'x' ? cz : end);
      add(g, { ...STONE });
    }
    // arcades of clustered piers
    const inset = S / 2 - 3.0;
    const n = Math.max(2, Math.floor((L - 6) / 5.5) + 1);
    const spacing = (L - 6) / (n - 1);
    const tops = [];
    for (let k = 0; k < n; k++) {
      const v = -L / 2 + 3 + k * spacing;
      for (const u of [-inset, inset]) {
        const [x, z] = P(u, v);
        const broken = rand() < 0.18;
        tops.push({ k, u, top: pier(add, x, z, 5.0, rand, broken) });
        C.circles.push({ x, z, r: 0.85 });
      }
      // transverse rib across the vault at each bay line
      const rib = extrude(archBandShape(S - 0.2, VAULT_F, 0.3, rand() < 0.15 ? 0.45 : 1, rand, 26), 0.4);
      if (long === 'z') { rib.translate(cx, ceil - 0.05, cz + v); } else { rib.rotateY(Math.PI / 2); rib.translate(cx + v, ceil - 0.05, cz); }
      add(rib, { ...STONE });
    }
    for (const u of [-inset, inset]) {
      for (let k = 0; k < n - 1; k++) {
        const ta = tops.find((t) => t.k === k && t.u === u).top, tb = tops.find((t) => t.k === k + 1 && t.u === u).top;
        if (!ta || !tb) continue;
        const v = -L / 2 + 3 + (k + 0.5) * spacing;
        const g = extrude(archBandShape(spacing - 0.9, 0.7, 0.4, 1, rand, 22), 0.7);
        const [x, z] = P(u, v);
        if (long === 'z') g.rotateY(Math.PI / 2);
        g.translate(x, ta, z);
        add(g, { ...STONE, disp: 0.02, dispScale: 2 });
        if (rand() < 0.5) out.drips.push({ x, y: ta + pointedArch(spacing - 0.9, 0.7).rise(0) - 0.05, z, period: 2.5 + rand() * 4 });
      }
    }
    const apex = ceil + arch.rise(0);
    for (let c = 0; c < 2; c++) {
      const [x, z] = P((rand() - 0.5) * 2, (rand() - 0.5) * (L - 8));
      out.chains.push({ x, y: apex - 0.3, z, bottom: 3.2 + rand() * 2.5, cage: c === 0 && rand() < 0.6 });
    }
    out.drips.push({ x: P(0, -L / 4)[0], y: apex - 0.5, z: P(0, -L / 4)[1], period: 5 + rand() * 3 });
  } else {
    // ribs across flat ceilings
    for (let v = -L / 2 + 2; v < L / 2 - 1; v += 3.5) {
      const span = S - 0.4;
      const f = 0.62;
      const spring = ceil - pointedArch(span, f).rise(0.22);
      if (spring < 1.6) continue;
      const g = extrude(archBandShape(span, f, 0.22, 1, rand, 20), 0.3);
      if (long === 'z') g.translate(cx, spring, cz + v); else { g.rotateY(Math.PI / 2); g.translate(cx + v, spring, cz); }
      add(g, { ...STONE });
    }
    for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
      const [x, z] = P((rand() - 0.5) * (S - 3), (rand() - 0.5) * (L - 3));
      out.drips.push({ x, y: ceil - 0.1, z, period: 2 + rand() * 4 });
      add(new THREE.ConeGeometry(0.06 + rand() * 0.06, 0.4 + rand() * 0.5, 6), { ...DARK_STONE, gloss: 0.6, matrix: mat([x, ceil - 0.3, z], [Math.PI, 0, 0]) });
    }
  }

  if (room.kind === 'crypt') {
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const [x, z] = P(su * S / 4, sv * L / 4);
      cryptColumn(add, x, z, ceil);
      C.circles.push({ x, z, r: 0.6 });
    }
    for (const s of solidSides(dg, room)) {
      if (rand() < 0.35) continue;
      const along = s.nx === 0; // wall runs along x
      const x = s.x + s.nx * 0.9, z = s.z + s.nz * 0.9;
      sarcophagus(add, x, z, along ? 0 : Math.PI / 2, rand);
      C.boxes.push(along ? { minX: x - 1.15, maxX: x + 1.15, minZ: z - 0.55, maxZ: z + 0.55, top: 0.8 }
                         : { minX: x - 0.55, maxX: x + 0.55, minZ: z - 1.15, maxZ: z + 1.15, top: 0.8 });
    }
  }

  if (room.kind === 'chapel') {
    const sides = solidSides(dg, room);
    if (sides.length && !room.isExit) {
      const s = sides[Math.floor(rand() * sides.length)];
      // two-step dais with an altar against an unbroken wall
      const along = s.nx === 0;
      const len = (along ? w : d) - 1;
      for (const [depth, top] of [[2.6, 0.12], [1.6, 0.42]]) {
        const x = s.x + s.nx * depth / 2, z = s.z + s.nz * depth / 2;
        const g = new THREE.BoxGeometry(along ? len : depth, top - FLOOR_Y, along ? depth : len, 4, 1, 2);
        add(g, { ...STONE, matrix: mat([x, (top + FLOOR_Y) / 2, z]), disp: 0.015 });
        out.walkables.push(along
          ? { minX: x - len / 2, maxX: x + len / 2, minZ: z - depth / 2, maxZ: z + depth / 2, top }
          : { minX: x - depth / 2, maxX: x + depth / 2, minZ: z - len / 2, maxZ: z + len / 2, top });
      }
      const ax = s.x + s.nx * 0.8, az = s.z + s.nz * 0.8;
      add(new THREE.BoxGeometry(along ? 2.2 : 0.9, 1.0, along ? 0.9 : 2.2, 2, 1, 1), { ...STONE, matrix: mat([ax, 0.42 + 0.5, az]), disp: 0.02 });
      C.boxes.push(along ? { minX: ax - 1.1, maxX: ax + 1.1, minZ: az - 0.45, maxZ: az + 0.45, top: 1.5 }
                         : { minX: ax - 0.45, maxX: ax + 0.45, minZ: az - 1.1, maxZ: az + 1.1, top: 1.5 });
    }
    const [fx, fz] = P((rand() < 0.5 ? -1 : 1) * (S / 2 - 2), (rand() - 0.5) * (L - 5));
    font(add, fx, fz);
    C.circles.push({ x: fx, z: fz, r: 0.75 });
    out.chains.push({ x: cx + 1.2, y: ceil, z: cz - 1.0, bottom: 2.4 + rand(), cage: rand() < 0.4 });
  }

  // beacon
  if (room.beacon) {
    const fire = room.kind === 'hall' ? greatBeacon(add, cx, cz, rand) : tripodBeacon(add, cx, cz, rand);
    C.circles.push({ x: cx, z: cz, r: room.kind === 'hall' ? 1.0 : 0.6 });
    out.beaconFires[room.beacon.index] = { pos: fire, room, kind: room.kind === 'hall' ? 'great' : 'tripod' };
    keepClear.push([cx, cz, 2.5]);
  }

  // exit door on an unbroken wall
  if (room.isExit) {
    const sides = solidSides(dg, room);
    const s = sides[0] || { nx: 0, nz: 1, x: cx, z: cz - d / 2 };
    const along = s.nx === 0;
    const span = 2.6;
    const fy = FLOOR_Y + 2.4;
    const g = extrude(archBandShape(span, 0.6, 0.45, 1, rand, 20), 0.8);
    if (!along) g.rotateY(Math.PI / 2);
    g.translate(s.x + s.nx * 0.1, fy, s.z + s.nz * 0.1);
    add(g, { ...STONE });
    for (const o of [-span / 2 - 0.3, span / 2 + 0.3]) {
      const jg = new THREE.BoxGeometry(along ? 0.6 : 0.8, fy - FLOOR_Y + 0.5, along ? 0.8 : 0.6, 1, 3, 1);
      add(jg, { ...STONE, matrix: mat([s.x + (along ? o : s.nx * 0.1), (fy + FLOOR_Y) / 2, s.z + (along ? s.nz * 0.1 : o)]) });
    }
    out.door = { x: s.x, z: s.z, nx: s.nx, nz: s.nz, along, span, springY: fy, rise: pointedArch(span, 0.6).rise(0) };
    keepClear.push([s.x + s.nx * 2, s.z + s.nz * 2, 2.5]);
  }

  // rubble, avoiding kept-clear spots
  for (let k = 0; k < 3; k++) {
    const [x, z] = P((rand() - 0.5) * (S - 3), (rand() - 0.5) * (L - 3));
    if (keepClear.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r)) continue;
    rubble(add, x, z, rand, 3 + Math.floor(rand() * 4), 0.9);
  }
}
