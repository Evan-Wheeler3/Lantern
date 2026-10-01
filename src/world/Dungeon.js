// Procedural layout: rooms on a 1 m grid, joined by 3 m wide hallways along a
// minimum spanning tree (plus a couple of loops). Pure data — DungeonBuilder turns
// it into geometry; World / Monsters / Minimap query it.
import { mulberry32 } from '../core/noise.js';

export const SOLID = 0;
export const ROOM = 1;
export const CORRIDOR = 2;

const KINDS = {
  hall:   { w: [12, 15], d: [20, 26], ceil: 10.0 },
  chapel: { w: [10, 13], d: [10, 14], ceil: 7.0 },
  crypt:  { w: [8, 11],  d: [8, 11],  ceil: 4.6 },
};
const CORRIDOR_CEIL = 4.2;

const ri = (rand, a, b) => a + Math.floor(rand() * (b - a + 1));

export class Dungeon {
  constructor(seed, { size = 100, roomCount = 10, beaconCount = 5 } = {}) {
    this.seed = seed;
    this.W = size;
    this.H = size;
    this.rand = mulberry32(seed);
    this.grid = new Uint8Array(size * size);
    this.roomOf = new Int16Array(size * size).fill(-1);
    this.ceil = new Float32Array(size * size);
    this.rooms = [];
    this.edges = [];
    this.corridors = []; // straight segments {a:[i,j], b:[i,j]}
    this.sanctum = null;
    this._generate(roomCount, beaconCount);
  }

  // ---------------------------------------------------------------- coordinates
  idx(i, j) { return j * this.W + i; }
  inBounds(i, j) { return i >= 0 && j >= 0 && i < this.W && j < this.H; }
  cellX(i) { return i - this.W / 2 + 0.5; }       // world x of cell centre
  cellZ(j) { return j - this.H / 2 + 0.5; }
  toI(x) { return Math.floor(x + this.W / 2); }
  toJ(z) { return Math.floor(z + this.H / 2); }
  type(i, j) { return this.inBounds(i, j) ? this.grid[this.idx(i, j)] : SOLID; }
  isFloor(i, j) { return this.type(i, j) !== SOLID; }
  isFloorAt(x, z) { return this.isFloor(this.toI(x), this.toJ(z)); }
  roomAt(x, z) {
    const i = this.toI(x), j = this.toJ(z);
    if (!this.inBounds(i, j)) return null;
    const r = this.roomOf[this.idx(i, j)];
    return r >= 0 ? this.rooms[r] : null;
  }

  // Grid ray march (solid cells block). Ignores props/pillars on purpose.
  lineOfSight(x0, z0, x1, z1, step = 0.35) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / step);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.isFloorAt(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- generation
  _generate(roomCount, beaconCount) {
    const R = this.rand;
    const order = ['crypt', 'chapel', 'hall', 'chapel', 'hall', 'crypt', 'chapel', 'hall', 'crypt', 'chapel', 'hall', 'crypt'];
    for (let n = 0, tries = 0; n < roomCount && tries < 2000; tries++) {
      const kind = order[n % order.length];
      const k = KINDS[kind];
      let w = ri(R, k.w[0], k.w[1]), d = ri(R, k.d[0], k.d[1]);
      if (R() < 0.5) [w, d] = [d, w];
      const i0 = ri(R, 3, this.W - w - 3), j0 = ri(R, 3, this.H - d - 3);
      const m = 5; // keep rooms apart so hallways have room to breathe
      if (this.rooms.some((r) => i0 < r.i0 + r.w + m && i0 + w + m > r.i0 && j0 < r.j0 + r.d + m && j0 + d + m > r.j0)) continue;
      const room = {
        id: this.rooms.length, kind, i0, j0, w, d, ceil: k.ceil,
        cx: this.cellX(i0) - 0.5 + w / 2, cz: this.cellZ(j0) - 0.5 + d / 2,
        longAxis: w >= d ? 'x' : 'z', links: [], beacon: null, isStart: false, isExit: false,
      };
      this.rooms.push(room);
      for (let j = j0; j < j0 + d; j++) {
        for (let i = i0; i < i0 + w; i++) {
          const id = this.idx(i, j);
          this.grid[id] = ROOM;
          this.roomOf[id] = room.id;
          this.ceil[id] = k.ceil;
        }
      }
      n++;
    }

    // Minimum spanning tree (Prim) on Manhattan distance, plus a few loops.
    const rs = this.rooms;
    const dist = (a, b) => Math.abs(a.cx - b.cx) + Math.abs(a.cz - b.cz);
    const inTree = new Set([0]);
    while (inTree.size < rs.length) {
      let best = null;
      for (const a of inTree) {
        for (const b of rs) {
          if (inTree.has(b.id)) continue;
          const dd = dist(rs[a], b);
          if (!best || dd < best.d) best = { a, b: b.id, d: dd };
        }
      }
      inTree.add(best.b);
      this.edges.push([best.a, best.b]);
    }
    const extra = [];
    for (const a of rs) for (const b of rs) {
      if (a.id >= b.id) continue;
      if (this.edges.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id))) continue;
      extra.push([a.id, b.id, dist(a, b)]);
    }
    extra.sort((p, q) => p[2] - q[2]);
    for (const [a, b] of extra.slice(0, 2)) this.edges.push([a, b]);

    for (const [a, b] of this.edges) {
      rs[a].links.push(b);
      rs[b].links.push(a);
      this._carve(rs[a], rs[b]);
    }

    // Start = a small room; exit = farthest from it by link hops (then distance).
    const start = rs.find((r) => r.kind !== 'hall') || rs[0];
    start.isStart = true;
    const hops = this._hops(start.id);
    this.hops = hops;
    // Exit = the farthest room that has space behind one of its walls for the
    // sanctum (the small chamber beyond the great door).
    const cands = rs.filter((r) => r !== start)
      .sort((a, b) => (hops[b.id] * 100 + dist(b, start)) - (hops[a.id] * 100 + dist(a, start)));
    let exit = null;
    for (const r of cands) {
      const sanct = this._placeSanctum(r);
      if (sanct) { exit = r; this.sanctum = sanct; break; }
    }
    if (!exit) exit = cands[0];
    exit.isExit = true;
    this.start = start;
    this.exit = exit;

    // Beacons: spread over the remaining rooms, preferring farther ones.
    const pool = rs.filter((r) => !r.isStart && !r.isExit && r.kind !== 'sanctum').sort((a, b) => hops[b.id] - hops[a.id] || R() - 0.5);
    const picks = [];
    const step = pool.length / Math.min(beaconCount, pool.length);
    for (let k = 0; k < Math.min(beaconCount, pool.length); k++) picks.push(pool[Math.floor(k * step)]);
    picks.forEach((r, k) => { r.beacon = { index: k }; });
    this.beaconRooms = picks;
  }

  // Try to carve a 6x5 sanctum one wall-thickness beyond a side of `room`,
  // joined by a 3-cell doorway. Returns {room, door:{i,j,axis,x,z,nx,nz}} or null.
  _placeSanctum(room) {
    const SW = 6, SD = 7, GAP = 1;
    const sides = [
      { nx: 0, nz: -1 }, { nx: 0, nz: 1 }, { nx: -1, nz: 0 }, { nx: 1, nz: 0 },
    ];
    for (const s of sides) {
      let i0, j0, w, d;
      const mi = room.i0 + Math.floor(room.w / 2), mj = room.j0 + Math.floor(room.d / 2);
      if (s.nz !== 0) {
        w = SW; d = SD;
        i0 = mi - Math.floor(SW / 2);
        j0 = s.nz < 0 ? room.j0 - GAP - SD : room.j0 + room.d + GAP;
      } else {
        w = SD; d = SW;
        j0 = mj - Math.floor(SW / 2);
        i0 = s.nx < 0 ? room.i0 - GAP - SD : room.i0 + room.w + GAP;
      }
      // the sanctum plus a 1-cell margin must be untouched rock (doorway row aside)
      let ok = i0 > 2 && j0 > 2 && i0 + w < this.W - 2 && j0 + d < this.H - 2;
      for (let j = j0 - 1; ok && j <= j0 + d; j++) {
        for (let i = i0 - 1; ok && i <= i0 + w; i++) {
          const inGap = s.nz !== 0 ? (j === (s.nz < 0 ? j0 + d : j0 - 1)) : (i === (s.nx < 0 ? i0 + w : i0 - 1));
          if (inGap && Math.abs((s.nz !== 0 ? i - mi : j - mj)) <= 1) continue;
          if (this.grid[this.idx(i, j)] !== SOLID) ok = false;
        }
      }
      // the doorway cells in the room wall row must also be rock (not a hallway)
      if (!ok) continue;
      const sid = this.rooms.length;
      const sanct = {
        id: sid, kind: 'sanctum', i0, j0, w, d, ceil: 4.6,
        cx: this.cellX(i0) - 0.5 + w / 2, cz: this.cellZ(j0) - 0.5 + d / 2,
        longAxis: w >= d ? 'x' : 'z', links: [room.id], beacon: null, isStart: false, isExit: false, isSanctum: true,
      };
      this.rooms.push(sanct);
      for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) {
        const id = this.idx(i, j);
        this.grid[id] = ROOM; this.roomOf[id] = sid; this.ceil[id] = 4.6;
      }
      // doorway: 3 cells through the wall row
      const cells = [];
      for (let o = -1; o <= 1; o++) {
        const ci = s.nz !== 0 ? mi + o : (s.nx < 0 ? i0 + w : i0 - 1);
        const cj = s.nz !== 0 ? (s.nz < 0 ? j0 + d : j0 - 1) : mj + o;
        const id = this.idx(ci, cj);
        this.grid[id] = CORRIDOR; this.ceil[id] = 4.2;
        cells.push([ci, cj]);
      }
      const [ci, cj] = cells[1];
      // door sits on the room-side face of the doorway
      const x = s.nz !== 0 ? this.cellX(ci) : this.cellX(ci) + (s.nx < 0 ? 0.5 : -0.5);
      const z = s.nz !== 0 ? this.cellZ(cj) + (s.nz < 0 ? 0.5 : -0.5) : this.cellZ(cj);
      return { room: sanct, door: { x, z, nx: -s.nx, nz: -s.nz, width: 3, cells } };
    }
    return null;
  }

  _hops(from) {
    const h = new Array(this.rooms.length).fill(Infinity);
    h[from] = 0;
    const q = [from];
    while (q.length) {
      const a = q.shift();
      for (const b of this.rooms[a].links) if (h[b] === Infinity) { h[b] = h[a] + 1; q.push(b); }
    }
    return h;
  }

  _carve(a, b) {
    const R = this.rand;
    const ai = this.toI(a.cx), aj = this.toJ(a.cz);
    const bi = this.toI(b.cx), bj = this.toJ(b.cz);
    const corner = R() < 0.5 ? [bi, aj] : [ai, bj];
    this._carveLine(ai, aj, corner[0], corner[1]);
    this._carveLine(corner[0], corner[1], bi, bj);
  }

  _carveLine(i0, j0, i1, j1) {
    this.corridors.push({ a: [i0, j0], b: [i1, j1] });
    const di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
    let i = i0, j = j0;
    for (;;) {
      for (let o = -1; o <= 1; o++) {
        const ci = di !== 0 ? i : i + o;
        const cj = di !== 0 ? j + o : j;
        if (!this.inBounds(ci, cj)) continue;
        const id = this.idx(ci, cj);
        if (this.grid[id] === SOLID) {
          this.grid[id] = CORRIDOR;
          this.ceil[id] = CORRIDOR_CEIL;
        }
      }
      if (i === i1 && j === j1) break;
      i += di; j += dj;
    }
    // fill the corner square of an L so the turn is a full 3x3
    for (let o = -1; o <= 1; o++) for (let p = -1; p <= 1; p++) {
      const ci = i1 + o, cj = j1 + p;
      if (!this.inBounds(ci, cj)) continue;
      const id = this.idx(ci, cj);
      if (this.grid[id] === SOLID) { this.grid[id] = CORRIDOR; this.ceil[id] = CORRIDOR_CEIL; }
    }
  }

  // Cells of a room (used to reveal/sanctify it).
  roomCells(room) {
    const out = [];
    for (let j = room.j0; j < room.j0 + room.d; j++) for (let i = room.i0; i < room.i0 + room.w; i++) out.push(this.idx(i, j));
    return out;
  }
}
