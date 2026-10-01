// Shadow creatures that hunt the keeper.
//  * In darkness they stalk along a flow field toward the player.
//  * The wide glow slows them; the focused beam holds them still and charges a
//    burning outline. At full charge they freeze for GAME.freezeTime seconds.
//  * The fire blast damages them (more when frozen) and pushes them back.
//  * Kindled beacon rooms are sanctuaries: they will not set foot inside.
import * as THREE from 'three';
import { buildTallOne, buildMourner, buildMoth, buildCeilingCrawler } from '../world/Creatures.js';
import { createCreatureMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { shared } from '../renderer/SharedUniforms.js';
import { settings } from '../core/Settings.js';
import { GAME } from '../core/GameConfig.js';
import { mulberry32 } from '../core/noise.js';
import { FLOOR_Y } from '../world/props.js';

// kind: ground (walks), fly (moths, lured by the beam and by fire), ceiling
// (hangs from vaults, drops on the keeper).
const TYPES = {
  stalker: { build: buildTallOne, speed: 1.5, hp: 3.0, radius: 0.4, scale: [0.85, 1.05], yOff: 0.05, kind: 'ground' },
  hound:   { build: buildMourner, speed: 2.15, hp: 2.0, radius: 0.45, scale: [0.95, 1.15], yOff: 0.1, kind: 'ground' },
  moth:    { speed: 1.3, lure: 3.6, hp: 1.0, radius: 0.35, scale: [1.2, 1.5], kind: 'fly' },
  ceiling: { build: buildCeilingCrawler, speed: 1.25, groundSpeed: 1.9, hp: 2.5, radius: 0.5, scale: [0.9, 1.05], yOff: 0.05, kind: 'ceiling' },
};

const atten = (d, range) => {
  const x = d / range;
  const w = Math.max(0, 1 - x ** 4);
  return (w * w) / (1 + 0.08 * d * d);
};

export class Monsters {
  constructor(scene, world, events, seed, round, { firebomb = null, drips = null } = {}) {
    this.scene = scene;
    this.world = world;
    this.dg = world.dungeon;
    this.events = events;
    this.round = round;
    this.firebomb = firebomb;
    this.drips = drips;
    this.rand = mulberry32(seed * 13 + 1);
    this.geos = {};
    for (const [k, T] of Object.entries(TYPES)) this.geos[k] = k === 'moth' ? buildMoth() : T.build();
    this.list = [];
    this.flow = new Int32Array(this.dg.W * this.dg.H).fill(-1);
    this.sanctuary = new Uint8Array(this.dg.W * this.dg.H);
    this._flowTimer = 0;
    this._lastPlayerCell = -1;
    this._respawn = GAME.respawnEvery;
    this.litCount = 0;
    this._tmp = new THREE.Vector3();
    this.paused = false;

    events.on('beaconLit', ({ room, count }) => {
      this.litCount = count;
      for (const id of this.dg.roomCells(room)) this.sanctuary[id] = 1;
      this._flowTimer = 0; // replan
    });
  }

  isSanctuary(i, j) {
    return this.dg.inBounds(i, j) && this.sanctuary[this.dg.idx(i, j)] === 1;
  }

  spawnInitial(playerPos) {
    for (const [type, n] of Object.entries(this.round.monsters)) {
      for (let k = 0; k < n; k++) this.spawnSomewhere(playerPos, type);
    }
  }

  _randomType() {
    const entries = Object.entries(this.round.monsters);
    const total = entries.reduce((a, [, n]) => a + n, 0);
    let r = this.rand() * total;
    for (const [t, n] of entries) { r -= n; if (r <= 0) return t; }
    return entries[0][0];
  }

  // Pick a dark room away from the player (never the start room or the sanctum).
  spawnSomewhere(playerPos, type = this._randomType()) {
    const R = this.rand;
    // ceiling crawlers need a ceiling they can reach: crypts, chapels
    const rooms = this.dg.rooms.filter((r) => !r.isStart && !r.isSanctum && (type !== 'ceiling' || r.kind !== 'hall'));
    for (let tries = 0; tries < 60; tries++) {
      const r = rooms[Math.floor(R() * rooms.length)];
      if (!r) return null;
      const x = r.cx + (R() - 0.5) * (r.w - 3);
      const z = r.cz + (R() - 0.5) * (r.d - 3);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 16) continue;
      const i = this.dg.toI(x), j = this.dg.toJ(z);
      if (this.isSanctuary(i, j)) continue;
      if (TYPES[type].kind === 'ground' && this.world.blocked(x, z, 0.6)) continue;
      return this.spawn(type, x, z);
    }
    return null;
  }

  spawn(type, x, z) {
    const T = TYPES[type];
    const mat = createCreatureMaterial();
    let mesh, wings = null;
    if (type === 'moth') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(this.geos.moth.body, mat);
      const wl = new THREE.Mesh(this.geos.moth.wing, mat);
      const wr = new THREE.Mesh(this.geos.moth.wing, mat);
      wl.scale.x = -1;
      mesh.add(body, wl, wr);
      wings = [wl, wr];
      mesh.traverse((o) => o.layers.set(LAYERS.WORLD));
    } else {
      mesh = new THREE.Mesh(this.geos[type], mat);
      mesh.layers.set(LAYERS.WORLD);
    }
    const s = T.scale[0] + this.rand() * (T.scale[1] - T.scale[0]);
    mesh.scale.setScalar(s);
    const y = T.kind === 'fly' ? 1.9 : T.kind === 'ceiling' ? this.world.ceilingAt(x, z) - 0.1 : FLOOR_Y + T.yOff;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const m = {
      type, T, mesh, mat, wings, x, y, z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, yaw: this.rand() * 6.28, hp: T.hp,
      charge: 0, frozen: 0, stun: 0, hurt: 0, dying: 0, phase: this.rand() * 10,
      wander: null, wanderT: 0, growlT: 2 + this.rand() * 6, hunting: false, scale: s,
      mode: T.kind === 'ceiling' ? 'ceiling' : T.kind, dripT: 1 + this.rand() * 2, flip: T.kind === 'ceiling' ? 1 : 0,
    };
    this.list.push(m);
    return m;
  }

  // Static per-cell traversal cost: impassable under pillars/props, expensive
  // next to walls (so paths run down the middle of hallways and doorways).
  _buildCost() {
    const dg = this.dg;
    const W = dg.W, H = dg.H;
    const cost = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const id = dg.idx(i, j);
        if (!dg.grid[id]) { cost[id] = 0; continue; }
        let c = 2;
        for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) if (!dg.isFloor(i + oi, j + oj)) c = 6;
        cost[id] = c;
      }
    }
    const props = [...this.world.colliders.circles.map((c) => ({ x: c.x, z: c.z, r: c.r })),
      ...this.world.colliders.boxes.map((b) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, r: Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 }))];
    for (const p of props) {
      const R = p.r + 0.9;
      for (let j = dg.toJ(p.z - R); j <= dg.toJ(p.z + R); j++) {
        for (let i = dg.toI(p.x - R); i <= dg.toI(p.x + R); i++) {
          if (!dg.inBounds(i, j)) continue;
          const id = dg.idx(i, j);
          if (!cost[id]) continue;
          const d = Math.hypot(dg.cellX(i) - p.x, dg.cellZ(j) - p.z);
          if (d < p.r + 0.25) cost[id] = 255;            // blocked
          else if (d < R) cost[id] = Math.max(cost[id], 6);
        }
      }
    }
    this.cost = cost;
  }

  // Dijkstra distance field from the player's cell (8-connected, no corner cutting).
  _rebuildFlow(px, pz) {
    const dg = this.dg;
    const W = dg.W;
    if (!this.cost) this._buildCost();
    const cost = this.cost;
    const flow = this.flow;
    flow.fill(-1);
    const si = dg.toI(px), sj = dg.toJ(pz);
    if (!dg.isFloor(si, sj)) return;
    const dist = this._dist || (this._dist = new Float32Array(W * dg.H));
    dist.fill(Infinity);
    // binary heap of [d, id]
    const hd = [], hi = [];
    const push = (d, id) => {
      let k = hd.length; hd.push(d); hi.push(id);
      while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= hd[k]) break; [hd[p], hd[k]] = [hd[k], hd[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; }
    };
    const pop = () => {
      const d = hd[0], id = hi[0];
      const ld = hd.pop(), li = hi.pop();
      if (hd.length) {
        hd[0] = ld; hi[0] = li;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < hd.length && hd[l] < hd[m]) m = l;
          if (r < hd.length && hd[r] < hd[m]) m = r;
          if (m === k) break;
          [hd[m], hd[k]] = [hd[k], hd[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m;
        }
      }
      return [d, id];
    };
    const s = dg.idx(si, sj);
    dist[s] = 0;
    push(0, s);
    const OI = [1, -1, 0, 0, 1, 1, -1, -1], OJ = [0, 0, 1, -1, 1, -1, 1, -1];
    const passable = (id) => cost[id] > 0 && cost[id] < 255 && !this.sanctuary[id];
    while (hd.length) {
      const [d, c] = pop();
      if (d > dist[c]) continue;
      if (d > 160) break;
      const ci = c % W, cj = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const ni = ci + OI[k], nj = cj + OJ[k];
        if (!dg.inBounds(ni, nj)) continue;
        const n = dg.idx(ni, nj);
        if (!passable(n)) continue;
        if (k >= 4 && (!passable(dg.idx(ni, cj)) || !passable(dg.idx(ci, nj)))) continue;
        const nd = d + cost[n] * (k >= 4 ? 1.414 : 1);
        if (nd < dist[n]) { dist[n] = nd; push(nd, n); }
      }
    }
    // store as integer "steps" (cost units / 2 ~ metres)
    for (let id = 0; id < flow.length; id++) if (dist[id] !== Infinity) flow[id] = Math.round(dist[id] * 0.5);
    this._distF = dist;
  }

  // How the lantern touches a point: wide-glow amount, beam factor, blast factor.
  _lanternAt(x, y, z, lantern) {
    const lp = shared.uLightPos.value;
    const dx = x - lp.x, dy = y - lp.y, dz = z - lp.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    const sd = shared.uSpotDir.value;
    const c = (dx * sd.x + dy * sd.y + dz * sd.z) / d;
    if (!this.dg.lineOfSight(lp.x, lp.z, x, z)) return { glow: 0, beam: 0, blast: 0, d };
    const glow = atten(d, shared.uLightRange.value) * shared.uLightIntensity.value;
    const spot = shared.uSpot.value; // cosOuter, cosInner
    const cone = THREE.MathUtils.smoothstep(c, spot.x - 0.03, spot.y);
    const beam = lantern.focus > 0.55 && d < shared.uLightRange.value * 0.9 ? cone : 0;
    const blast = lantern.blasting && d < GAME.blastRange && c > GAME.blastCos ? 1 - d / GAME.blastRange * 0.5 : 0;
    return { glow, beam, blast, d };
  }

  _flowDir(m, i, j) {
    const dg = this.dg;
    const D = this._distF;
    let best = D[dg.idx(i, j)], bi = i, bj = j;
    for (let k = 0; k < 8; k++) {
      const oi = [1, -1, 0, 0, 1, 1, -1, -1][k], oj = [0, 0, 1, -1, 1, -1, 1, -1][k];
      if (!dg.inBounds(i + oi, j + oj)) continue;
      const v = D[dg.idx(i + oi, j + oj)];
      if (!(v < best)) continue;
      best = v; bi = i + oi; bj = j + oj;
    }
    const tx = dg.cellX(bi) - m.x, tz = dg.cellZ(bj) - m.z, tl = Math.hypot(tx, tz) || 1;
    return [tx / tl, tz / tl];
  }

  _kill(m) {
    m.dying = 0.001;
    this.events.emit('monsterKilled', { x: m.x, z: m.z, type: m.type });
  }

  update(dt, t, player, lantern, game) {
    const dg = this.dg;
    const playing = game.state === 'playing' && !game.paused;
    const px = player.feet.x, pz = player.feet.z;
    const pools = this.firebomb ? this.firebomb.pools : [];

    this._flowTimer -= dt;
    const pc = dg.idx(dg.toI(px), dg.toJ(pz));
    if (this._flowTimer <= 0 || pc !== this._lastPlayerCell) {
      this._rebuildFlow(px, pz);
      this._lastPlayerCell = pc;
      this._flowTimer = 0.4;
    }

    if (playing) {
      this._respawn -= dt;
      const alive = this.list.filter((m) => !m.dying).length;
      if (this._respawn <= 0) {
        this._respawn = GAME.respawnEvery / Math.max(0.5, this.round.speed);
        if (alive < this.round.maxMonsters) this.spawnSomewhere(player.feet);
      }
    }

    const cr = settings.creatures;
    const spd = GAME.monsterSpeed;
    for (let n = this.list.length - 1; n >= 0; n--) {
      const m = this.list[n];
      const u = m.mat.uniforms;
      u.uRim.value.set(cr.rimPower, cr.rimThreshold, cr.rimBase);

      if (m.dying > 0) {
        m.dying += dt / 1.3;
        u.uDissolve.value = Math.min(1, m.dying);
        m.mesh.position.y += dt * (m.mode === 'ceiling' ? -0.3 : 0.15);
        if (m.dying >= 1) {
          this.scene.remove(m.mesh);
          m.mat.dispose();
          this.list.splice(n, 1);
        }
        continue;
      }
      if (!playing && game.paused) continue; // story plate open: the world holds its breath

      const probeY = m.mode === 'ground' ? FLOOR_Y + 1.3 * m.scale * (m.type === 'hound' ? 0.6 : 1) : m.y;
      const L = playing ? this._lanternAt(m.x, probeY, m.z, lantern) : { glow: 0, beam: 0, blast: 0, d: 99 };

      // ---- beam charge / freeze (moths drink the light instead) ----
      if (m.type === 'moth') {
        m.charge = 0;
      } else if (m.frozen > 0) {
        m.frozen = Math.max(0, m.frozen - dt);
        m.charge = 0;
      } else if (L.beam > 0.05) {
        const close = Math.max(0, 1 - L.d / 14);
        m.charge = Math.min(1, m.charge + dt * GAME.chargeRate * L.beam * (0.7 + close));
        if (m.charge >= 1) {
          m.frozen = GAME.freezeTime;
          m.charge = 0;
          this.events.emit('monsterFrozen', { x: m.x, z: m.z });
        }
      } else {
        m.charge = Math.max(0, m.charge - dt * GAME.chargeDecay);
      }
      u.uCharge.value = m.charge;
      u.uFrozen.value = m.frozen / GAME.freezeTime;

      // ---- fire: blast + burning pools ----
      m.hurt = Math.max(0, m.hurt - dt * 3);
      let burn = 0;
      if (L.blast > 0) {
        burn += GAME.blastDps * L.blast * (m.frozen > 0 ? GAME.blastFrozenMul : 1);
        const lp = shared.uLightPos.value;
        const dx = m.x - lp.x, dz = m.z - lp.z, dl = Math.hypot(dx, dz) || 1;
        if (m.frozen <= 0 && m.mode !== 'ceiling') { m.kx = (dx / dl) * GAME.blastKnock; m.kz = (dz / dl) * GAME.blastKnock; }
      }
      for (const p of pools) {
        if (Math.hypot(m.x - p.x, m.z - p.z) < p.r && (m.mode !== 'ceiling') && (m.mode !== 'fly' || m.y < 3.2)) burn += GAME.throwDps * p.level;
      }
      if (burn > 0) {
        m.hp -= dt * burn;
        m.hurt = 1;
        if (m.hp <= 0) { this._kill(m); continue; }
      }
      u.uHurt.value = m.hurt;

      // ---- movement ----
      m.stun = Math.max(0, m.stun - dt);
      let dirX = 0, dirZ = 0, speed = 0, targetY = null;
      const i = dg.toI(m.x), j = dg.toJ(m.z);
      const here = this.flow[dg.idx(i, j)];
      const toPX = px - m.x, toPZ = pz - m.z;
      const distP = Math.hypot(toPX, toPZ);
      const sees = distP < 16 && dg.lineOfSight(m.x, m.z, px, pz);
      m.hunting = playing && here >= 0 && (here <= GAME.aggroDist || sees);

      if (m.type === 'moth') {
        // lured by the beam, then by fire; otherwise a slow, fluttering hunt
        const lp = shared.uLightPos.value;
        const pool = pools.find((p) => Math.hypot(p.x - m.x, p.z - m.z) < 24 && dg.lineOfSight(m.x, m.z, p.x, p.z));
        let tx = null, tz = null;
        if (playing && lantern.focus > 0.5 && L.d < 30 && dg.lineOfSight(m.x, m.z, lp.x, lp.z)) {
          tx = lp.x; tz = lp.z; targetY = lp.y + 0.2; speed = m.T.lure; m.lured = 1;
        } else if (pool) {
          const a = t * 2.2 + m.phase;
          tx = pool.x + Math.cos(a) * pool.r * 0.6; tz = pool.z + Math.sin(a) * pool.r * 0.6; targetY = 1.1; speed = m.T.lure * 0.8; m.lured = 1;
        } else if (m.hunting) {
          m.lured = 0;
          if (sees) { tx = px; tz = pz; } else { const [ax, az] = this._flowDir(m, i, j); dirX = ax; dirZ = az; }
          targetY = 1.6; speed = m.T.speed;
        } else { m.lured = 0; targetY = 2.2; }
        if (tx !== null) { const dl = Math.hypot(tx - m.x, tz - m.z) || 1; dirX = (tx - m.x) / dl; dirZ = (tz - m.z) / dl; }
        // flutter
        dirX += Math.sin(t * 5.3 + m.phase) * 0.35; dirZ += Math.cos(t * 4.1 + m.phase * 2) * 0.35;
        const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
      } else if (m.mode === 'falling') {
        m.vy -= 9.81 * dt;
        m.y += m.vy * dt;
        m.flip = Math.max(0, m.flip - dt * 2.5);
        if (m.y <= FLOOR_Y + m.T.yOff) {
          m.y = FLOOR_Y + m.T.yOff; m.mode = 'ground'; m.vy = 0; m.stun = 0.35;
          this.events.emit('crawlerLand', { x: m.x, z: m.z });
        }
      } else if (m.hunting) {
        if (m.mode === 'ground' && distP < 7 && sees) {
          dirX = toPX / distP; dirZ = toPZ / distP;
        } else {
          [dirX, dirZ] = this._flowDir(m, i, j);
        }
        if (m.sidestep > 0) {
          m.sidestep -= dt;
          const sx = -dirZ * m.sideSign, sz = dirX * m.sideSign;
          dirX = dirX * 0.3 + sx; dirZ = dirZ * 0.3 + sz;
          const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
        }
        speed = m.mode === 'ceiling' ? m.T.speed : (m.T.groundSpeed || m.T.speed);
        // a ceiling crawler right above the keeper lets go
        if (m.mode === 'ceiling' && playing && distP < 1.8 && m.frozen <= 0) {
          m.mode = 'falling'; m.vy = 0;
          this.events.emit('crawlerDrop', { x: m.x, z: m.z });
        }
      } else {
        m.wanderT -= dt;
        if (!m.wander || m.wanderT <= 0) {
          const r = dg.roomAt(m.x, m.z);
          m.wander = r ? [r.cx + (this.rand() - 0.5) * (r.w - 3), r.cz + (this.rand() - 0.5) * (r.d - 3)] : [m.x, m.z];
          m.wanderT = 4 + this.rand() * 5;
        }
        const tx = m.wander[0] - m.x, tz = m.wander[1] - m.z, tl = Math.hypot(tx, tz);
        if (tl > 0.5) { dirX = tx / tl; dirZ = tz / tl; speed = 0.5; }
      }
      // light response: the glow slows, the beam holds, frost/stun stops (moths love it)
      if (m.type !== 'moth') {
        speed *= 1 - 0.55 * Math.min(1, L.glow * 1.6);
        if (L.beam > 0.3) speed = 0;
      }
      if (m.frozen > 0 || m.stun > 0 || m.mode === 'falling') speed = 0;
      speed *= spd;

      const acc = 1 - Math.exp(-dt * (m.type === 'moth' ? 2.5 : 4));
      m.vx += (dirX * speed - m.vx) * acc;
      m.vz += (dirZ * speed - m.vz) * acc;
      m.kx *= Math.exp(-dt * 4); m.kz *= Math.exp(-dt * 4);
      const sx = (m.vx + m.kx) * dt, sz = (m.vz + m.kz) * dt;
      const ox = m.x, oz = m.z;
      if (m.mode === 'ground') {
        const solid = (a, b) => this.isSanctuary(a, b);
        if (!this.world.blocked(m.x + sx, m.z, m.T.radius, FLOOR_Y, solid)) m.x += sx;
        if (!this.world.blocked(m.x, m.z + sz, m.T.radius, FLOOR_Y, solid)) m.z += sz;
      } else if (m.mode !== 'falling') {
        // fliers and ceiling crawlers only respect walls (and sanctuaries)
        const ok = (x, z) => { const ci = dg.toI(x), cj = dg.toJ(z); return dg.isFloor(ci, cj) && !this.isSanctuary(ci, cj); };
        const r = m.T.radius;
        if (ok(m.x + sx + Math.sign(sx) * r, m.z)) m.x += sx;
        if (ok(m.x, m.z + sz + Math.sign(sz) * r)) m.z += sz;
      }
      const moved = Math.hypot(m.x - ox, m.z - oz);
      if (speed > 0.2 && moved < speed * dt * 0.25) m.stuck = (m.stuck || 0) + dt; else m.stuck = 0;
      if (m.stuck > 0.35 && !(m.sidestep > 0)) { m.sidestep = 0.6; m.sideSign = this.rand() < 0.5 ? -1 : 1; m.stuck = 0; }

      // vertical placement per kind
      if (m.type === 'moth') {
        const ty = (targetY ?? 1.9) + Math.sin(t * 3.1 + m.phase) * 0.25;
        m.y += (Math.min(ty, this.world.ceilingAt(m.x, m.z) - 0.6) - m.y) * (1 - Math.exp(-dt * 2));
      } else if (m.mode === 'ceiling') {
        const ceil = this.world.ceilingAt(m.x, m.z);
        if (ceil > 8.5) { m.mode = 'falling'; m.vy = 0; } // a hall's vault is out of reach: it lets go
        else m.y = ceil - 0.1;
        m.dripT -= dt;
        if (m.dripT <= 0 && this.drips) { m.dripT = 1.1 + this.rand() * 1.4; this.drips.drop(m.x, m.y - 0.5, m.z); }
      } else if (m.mode === 'ground') {
        m.y = FLOOR_Y + m.T.yOff;
      }

      // ---- attack ----
      const reach = GAME.attackRange + m.T.radius * 0.5;
      const canHit = m.mode === 'ground' || (m.type === 'moth' && Math.abs(m.y - 1.4) < 1.3);
      if (playing && canHit && distP < reach && m.frozen <= 0 && m.stun <= 0) {
        this.events.emit('playerHit', { x: m.x, z: m.z });
        m.stun = 1.8;
        m.kx = -toPX / (distP || 1) * 3; m.kz = -toPZ / (distP || 1) * 3;
      }

      // ---- voices ----
      m.growlT -= dt;
      if (m.hunting && m.growlT <= 0 && m.frozen <= 0 && m.type !== 'ceiling') {
        m.growlT = 3 + this.rand() * 6;
        if (distP < 26) this.events.emit('monsterGrowl', { x: m.x, z: m.z, type: m.type, dist: distP });
      }

      // ---- animate ----
      const moving = Math.hypot(m.vx, m.vz);
      if (m.frozen <= 0) {
        m.phase += dt * (1.5 + moving * 3);
        if (moving > 0.05) {
          const targetYaw = Math.atan2(m.vx, m.vz);
          const dy = Math.atan2(Math.sin(targetYaw - m.yaw), Math.cos(targetYaw - m.yaw));
          m.yaw += dy * (1 - Math.exp(-dt * 5));
        } else if (m.hunting) {
          const targetYaw = Math.atan2(toPX, toPZ);
          const dy = Math.atan2(Math.sin(targetYaw - m.yaw), Math.cos(targetYaw - m.yaw));
          m.yaw += dy * (1 - Math.exp(-dt * 2));
        }
      }
      if (m.type === 'moth') {
        // wings held in a raised V so the silhouette reads from the side, beating through it
        const flap = 0.55 + (m.frozen > 0 ? 0 : Math.sin(t * (m.lured ? 26 : 16) + m.phase) * 0.75);
        m.wings[0].rotation.z = -flap; m.wings[1].rotation.z = flap;
        m.mesh.position.set(m.x, m.y, m.z);
        m.mesh.rotation.set(Math.min(moving, 3) * 0.1, m.yaw, Math.sin(t * 2 + m.phase) * 0.2);
      } else if (m.type === 'ceiling') {
        m.mesh.position.set(m.x, m.y, m.z);
        // hangs upside down; rights itself while dropping
        m.mesh.rotation.set(Math.PI * m.flip, m.yaw, 0, 'YXZ');
        if (m.mode === 'ground') m.mesh.rotation.x = Math.min(moving, 2) * 0.05;
      } else {
        m.mesh.position.set(m.x, m.y + Math.abs(Math.sin(m.phase)) * 0.05 * Math.min(1, moving), m.z);
        m.mesh.rotation.set(Math.min(moving, 2) * 0.08, m.yaw, Math.sin(m.phase * 0.5) * 0.04);
      }
    }
  }
}
