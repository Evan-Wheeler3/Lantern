// Shadow creatures that hunt the keeper.
//  * In darkness they stalk along a flow field toward the player.
//  * The wide glow slows them; the focused beam holds them still and charges a
//    burning outline. At full charge they freeze for GAME.freezeTime seconds.
//  * The fire blast damages them (more when frozen) and pushes them back.
//  * Kindled beacon rooms are sanctuaries: they will not set foot inside.
import * as THREE from 'three';
import { buildTallOne, buildMourner } from '../world/Creatures.js';
import { createCreatureMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { shared } from '../renderer/SharedUniforms.js';
import { settings } from '../core/Settings.js';
import { GAME } from '../core/GameConfig.js';
import { mulberry32 } from '../core/noise.js';
import { FLOOR_Y } from '../world/props.js';

const TYPES = {
  stalker: { build: buildTallOne, speed: 1.5, hp: 3.0, radius: 0.4, scale: [0.85, 1.05], yOff: 0.05 },
  crawler: { build: buildMourner, speed: 2.15, hp: 2.0, radius: 0.45, scale: [0.95, 1.15], yOff: 0.1 },
};

const atten = (d, range) => {
  const x = d / range;
  const w = Math.max(0, 1 - x ** 4);
  return (w * w) / (1 + 0.08 * d * d);
};

export class Monsters {
  constructor(scene, world, events, seed) {
    this.scene = scene;
    this.world = world;
    this.dg = world.dungeon;
    this.events = events;
    this.rand = mulberry32(seed * 13 + 1);
    this.geos = { stalker: TYPES.stalker.build(), crawler: TYPES.crawler.build() };
    this.list = [];
    this.flow = new Int32Array(this.dg.W * this.dg.H).fill(-1);
    this.sanctuary = new Uint8Array(this.dg.W * this.dg.H);
    this._flowTimer = 0;
    this._lastPlayerCell = -1;
    this._respawn = GAME.respawnEvery;
    this.litCount = 0;
    this._tmp = new THREE.Vector3();

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
    for (let k = 0; k < GAME.monstersStart; k++) this.spawnSomewhere(playerPos, k % 3 === 2 ? 'crawler' : 'stalker');
  }

  // Pick a dark room away from the player (and from the start room).
  spawnSomewhere(playerPos, type = this.rand() < 0.35 ? 'crawler' : 'stalker') {
    const R = this.rand;
    const rooms = this.dg.rooms.filter((r) => !r.isStart);
    for (let tries = 0; tries < 60; tries++) {
      const r = rooms[Math.floor(R() * rooms.length)];
      if (!r) return null;
      const x = r.cx + (R() - 0.5) * (r.w - 3);
      const z = r.cz + (R() - 0.5) * (r.d - 3);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 16) continue;
      const i = this.dg.toI(x), j = this.dg.toJ(z);
      if (this.isSanctuary(i, j)) continue;
      if (this.world.blocked(x, z, 0.6)) continue;
      return this.spawn(type, x, z);
    }
    return null;
  }

  spawn(type, x, z) {
    const T = TYPES[type];
    const mat = createCreatureMaterial();
    const mesh = new THREE.Mesh(this.geos[type], mat);
    const s = T.scale[0] + this.rand() * (T.scale[1] - T.scale[0]);
    mesh.scale.setScalar(s);
    mesh.position.set(x, FLOOR_Y + T.yOff, z);
    mesh.layers.set(LAYERS.WORLD);
    this.scene.add(mesh);
    const m = {
      type, T, mesh, mat, x, z, vx: 0, vz: 0, kx: 0, kz: 0, yaw: this.rand() * 6.28, hp: T.hp,
      charge: 0, frozen: 0, stun: 0, hurt: 0, dying: 0, phase: this.rand() * 10,
      wander: null, wanderT: 0, growlT: 2 + this.rand() * 6, hunting: false, scale: s,
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

  update(dt, t, player, lantern, game) {
    const dg = this.dg;
    const playing = game.state === 'playing';
    const px = player.feet.x, pz = player.feet.z;

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
        this._respawn = GAME.respawnEvery;
        if (alive < GAME.monstersMaxBase + this.litCount) this.spawnSomewhere(player.feet);
      }
    }

    const cr = settings.creatures;
    for (let n = this.list.length - 1; n >= 0; n--) {
      const m = this.list[n];
      const u = m.mat.uniforms;
      u.uRim.value.set(cr.rimPower, cr.rimThreshold, cr.rimBase);

      if (m.dying > 0) {
        m.dying += dt / 1.3;
        u.uDissolve.value = Math.min(1, m.dying);
        m.mesh.position.y += dt * 0.15;
        if (m.dying >= 1) {
          this.scene.remove(m.mesh);
          m.mat.dispose();
          this.list.splice(n, 1);
        }
        continue;
      }

      const chestY = FLOOR_Y + 1.3 * m.scale * (m.type === 'crawler' ? 0.6 : 1);
      const L = playing ? this._lanternAt(m.x, chestY, m.z, lantern) : { glow: 0, beam: 0, blast: 0, d: 99 };

      // ---- beam charge / freeze ----
      if (m.frozen > 0) {
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

      // ---- blast ----
      m.hurt = Math.max(0, m.hurt - dt * 3);
      if (L.blast > 0) {
        m.hp -= dt * GAME.blastDps * L.blast * (m.frozen > 0 ? GAME.blastFrozenMul : 1);
        m.hurt = 1;
        const lp = shared.uLightPos.value;
        const dx = m.x - lp.x, dz = m.z - lp.z, dl = Math.hypot(dx, dz) || 1;
        if (m.frozen <= 0) { m.kx = (dx / dl) * GAME.blastKnock; m.kz = (dz / dl) * GAME.blastKnock; }
        if (m.hp <= 0) {
          m.dying = 0.001;
          this.events.emit('monsterKilled', { x: m.x, z: m.z, type: m.type });
          continue;
        }
      }
      u.uHurt.value = m.hurt;

      // ---- movement ----
      m.stun = Math.max(0, m.stun - dt);
      let dirX = 0, dirZ = 0, speed = 0;
      const i = dg.toI(m.x), j = dg.toJ(m.z);
      const here = this.flow[dg.idx(i, j)];
      const toPX = px - m.x, toPZ = pz - m.z;
      const distP = Math.hypot(toPX, toPZ);
      m.hunting = playing && here >= 0 && (here <= GAME.aggroDist || (distP < 16 && dg.lineOfSight(m.x, m.z, px, pz)));
      if (m.hunting) {
        if (distP < 7 && dg.lineOfSight(m.x, m.z, px, pz)) {
          dirX = toPX / distP; dirZ = toPZ / distP;
        } else {
          // step toward the neighbouring cell with the smallest distance
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
          dirX = tx / tl; dirZ = tz / tl;
        }
        if (m.sidestep > 0) {
          // unstick: slide sideways for a moment
          m.sidestep -= dt;
          const sx = -dirZ * m.sideSign, sz = dirX * m.sideSign;
          dirX = dirX * 0.3 + sx; dirZ = dirZ * 0.3 + sz;
          const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
        }
        speed = m.T.speed;
      } else {
        // drift around its room
        m.wanderT -= dt;
        if (!m.wander || m.wanderT <= 0) {
          const r = dg.roomAt(m.x, m.z);
          m.wander = r ? [r.cx + (this.rand() - 0.5) * (r.w - 3), r.cz + (this.rand() - 0.5) * (r.d - 3)] : [m.x, m.z];
          m.wanderT = 4 + this.rand() * 5;
        }
        const tx = m.wander[0] - m.x, tz = m.wander[1] - m.z, tl = Math.hypot(tx, tz);
        if (tl > 0.5) { dirX = tx / tl; dirZ = tz / tl; speed = 0.5; }
      }
      // light response: the glow slows, the beam holds, frost/stun stops
      speed *= 1 - 0.55 * Math.min(1, L.glow * 1.6);
      if (L.beam > 0.3) speed = 0;
      if (m.frozen > 0 || m.stun > 0) speed = 0;

      const acc = 1 - Math.exp(-dt * 4);
      m.vx += (dirX * speed - m.vx) * acc;
      m.vz += (dirZ * speed - m.vz) * acc;
      m.kx *= Math.exp(-dt * 4); m.kz *= Math.exp(-dt * 4);
      const sx = (m.vx + m.kx) * dt, sz = (m.vz + m.kz) * dt;
      const solid = (a, b) => this.isSanctuary(a, b);
      const ox = m.x, oz = m.z;
      if (!this.world.blocked(m.x + sx, m.z, m.T.radius, FLOOR_Y, solid)) m.x += sx;
      if (!this.world.blocked(m.x, m.z + sz, m.T.radius, FLOOR_Y, solid)) m.z += sz;
      // stuck against something while trying to move? sidestep
      const moved = Math.hypot(m.x - ox, m.z - oz);
      if (speed > 0.2 && moved < speed * dt * 0.25) m.stuck = (m.stuck || 0) + dt; else m.stuck = 0;
      if (m.stuck > 0.35 && !(m.sidestep > 0)) { m.sidestep = 0.6; m.sideSign = this.rand() < 0.5 ? -1 : 1; m.stuck = 0; }

      // ---- attack ----
      if (playing && distP < GAME.attackRange + m.T.radius * 0.5 && m.frozen <= 0 && m.stun <= 0) {
        this.events.emit('playerHit', { x: m.x, z: m.z });
        m.stun = 1.8;
        m.kx = -toPX / (distP || 1) * 3; m.kz = -toPZ / (distP || 1) * 3;
      }

      // ---- growls ----
      m.growlT -= dt;
      if (m.hunting && m.growlT <= 0 && m.frozen <= 0) {
        m.growlT = 3 + this.rand() * 6;
        if (distP < 26) this.events.emit('monsterGrowl', { x: m.x, z: m.z, type: m.type, dist: distP });
      }

      // ---- animate: glide, bob, lean into the hunt; frozen = locked mid-motion ----
      const moving = Math.hypot(m.vx, m.vz);
      if (m.frozen <= 0) {
        m.phase += dt * (1.5 + moving * 3);
        if (moving > 0.05) {
          const targetYaw = Math.atan2(m.vx, m.vz);
          let dy = targetYaw - m.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          m.yaw += dy * (1 - Math.exp(-dt * 5));
        } else if (m.hunting) {
          const targetYaw = Math.atan2(toPX, toPZ);
          let dy = targetYaw - m.yaw;
          m.yaw += Math.atan2(Math.sin(dy), Math.cos(dy)) * (1 - Math.exp(-dt * 2));
        }
      }
      m.mesh.position.set(m.x, FLOOR_Y + m.T.yOff + Math.abs(Math.sin(m.phase)) * 0.05 * Math.min(1, moving), m.z);
      m.mesh.rotation.set(Math.min(moving, 2) * 0.08, m.yaw, Math.sin(m.phase * 0.5) * 0.04);
    }
  }
}
