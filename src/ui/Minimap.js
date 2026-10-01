// Fog-of-war minimap drawn in the palette. Cells are revealed by line of sight
// around the keeper; kindling a beacon reveals (and gilds) its whole room.
// Small north-up map top-right; hold M for the full map.
const PAL = { ink: '#07060A', oil: '#1A1210', ember: '#FF8A1F', cream: '#FFE2B0' };
const PX = 3; // pixels per cell on the offscreen map

export class Minimap {
  constructor(dungeon, events, beacons) {
    this.dg = dungeon;
    this.beacons = beacons;
    this.revealed = new Uint8Array(dungeon.W * dungeon.H);
    this.litRooms = new Set();
    this.off = document.createElement('canvas');
    this.off.width = dungeon.W * PX;
    this.off.height = dungeon.H * PX;
    this.dirty = true;
    this._t = 0;

    this.small = document.getElementById('minimap');
    this.big = document.getElementById('bigmap');
    this.ctx = this.small.getContext('2d');
    this.bigCtx = this.big.getContext('2d');
    this.showBig = false;
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.showBig = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyM') this.showBig = false; });

    events.on('beaconLit', ({ room }) => {
      this.litRooms.add(room.id);
      for (const id of dungeon.roomCells(room)) this.revealed[id] = 1;
      this.dirty = true;
    });
  }

  _reveal(px, pz) {
    const dg = this.dg;
    const R = 9;
    const ci = dg.toI(px), cj = dg.toJ(pz);
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (!dg.isFloor(i, j)) continue;
        const id = dg.idx(i, j);
        if (this.revealed[id]) continue;
        const x = dg.cellX(i), z = dg.cellZ(j);
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;
        if (!dg.lineOfSight(px, pz, x, z, 0.5)) continue;
        this.revealed[id] = 1;
        this.dirty = true;
      }
    }
  }

  _redraw() {
    const dg = this.dg;
    const c = this.off.getContext('2d');
    c.clearRect(0, 0, this.off.width, this.off.height);
    const isRev = (i, j) => dg.inBounds(i, j) && this.revealed[dg.idx(i, j)];
    for (let j = 0; j < dg.H; j++) {
      for (let i = 0; i < dg.W; i++) {
        if (!isRev(i, j)) continue;
        const r = dg.roomOf[dg.idx(i, j)];
        c.fillStyle = r >= 0 && this.litRooms.has(r) ? 'rgba(255,138,31,0.42)' : PAL.oil;
        c.fillRect(i * PX, j * PX, PX, PX);
      }
    }
    c.fillStyle = PAL.ember;
    for (let j = 0; j < dg.H; j++) {
      for (let i = 0; i < dg.W; i++) {
        if (!isRev(i, j)) continue;
        if (!dg.isFloor(i - 1, j)) c.fillRect(i * PX, j * PX, 1, PX);
        if (!dg.isFloor(i + 1, j)) c.fillRect(i * PX + PX - 1, j * PX, 1, PX);
        if (!dg.isFloor(i, j - 1)) c.fillRect(i * PX, j * PX, PX, 1);
        if (!dg.isFloor(i, j + 1)) c.fillRect(i * PX, j * PX + PX - 1, PX, 1);
      }
    }
    this.dirty = false;
  }

  _icons(c, toPx, scale) {
    const dg = this.dg;
    for (const b of this.beacons.list) {
      if (!this.revealed[dg.idx(dg.toI(b.pos.x), dg.toJ(b.pos.z))] && !b.lit) continue;
      const [x, y] = toPx(b.pos.x, b.pos.z);
      const s = 2.2 * scale;
      c.beginPath();
      c.moveTo(x, y - s * 1.4); c.lineTo(x + s, y); c.lineTo(x, y + s * 1.4); c.lineTo(x - s, y); c.closePath();
      if (b.lit) { c.fillStyle = PAL.cream; c.fill(); } else { c.strokeStyle = PAL.ember; c.lineWidth = Math.max(1, scale * 0.6); c.stroke(); }
    }
    const d = this.beacons.door;
    if (d && this.revealed[dg.idx(dg.toI(d.x + d.nx * 1.5), dg.toJ(d.z + d.nz * 1.5))]) {
      const [x, y] = toPx(d.x, d.z);
      const s = 2.6 * scale;
      c.fillStyle = this.beacons.doorUnsealed ? PAL.cream : PAL.oil;
      c.strokeStyle = PAL.ember;
      c.lineWidth = Math.max(1, scale * 0.6);
      c.beginPath(); c.rect(x - s, y - s, s * 2, s * 2); c.fill(); c.stroke();
    }
  }

  _arrow(c, x, y, yaw, s) {
    c.save();
    c.translate(x, y);
    c.rotate(-yaw);
    c.beginPath();
    c.moveTo(0, -s * 1.5); c.lineTo(s, s); c.lineTo(0, s * 0.4); c.lineTo(-s, s); c.closePath();
    c.fillStyle = PAL.cream;
    c.fill();
    c.restore();
  }

  update(dt, player) {
    this._t -= dt;
    if (this._t <= 0) { this._reveal(player.feet.x, player.feet.z); this._t = 0.15; }
    if (this.dirty) this._redraw();
    const dg = this.dg;
    const px = player.feet.x, pz = player.feet.z;

    // small, centred on the player
    const c = this.ctx;
    const S = this.small.width;
    const zoom = 1.6; // canvas px per offscreen px
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = PAL.ink; c.fillRect(0, 0, S, S);
    const ox = S / 2 - (px + dg.W / 2) * PX * zoom, oy = S / 2 - (pz + dg.H / 2) * PX * zoom;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.off, ox, oy, this.off.width * zoom, this.off.height * zoom);
    this._icons(c, (x, z) => [ox + (x + dg.W / 2) * PX * zoom, oy + (z + dg.H / 2) * PX * zoom], 1.6);
    this._arrow(c, S / 2, S / 2, player.yaw, 5);
    c.restore();
    c.strokeStyle = PAL.ember; c.lineWidth = 2;
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.stroke();

    // full map while M is held
    this.big.style.display = this.showBig ? 'block' : 'none';
    if (this.showBig) {
      const B = this.big;
      const w = (B.width = Math.min(window.innerWidth, window.innerHeight) * 0.8 * devicePixelRatio | 0);
      B.height = w;
      const b = this.bigCtx;
      const k = w / this.off.width;
      b.fillStyle = 'rgba(7,6,10,0.92)'; b.fillRect(0, 0, w, w);
      b.imageSmoothingEnabled = false;
      b.drawImage(this.off, 0, 0, w, w);
      const toPx = (x, z) => [(x + dg.W / 2) * PX * k, (z + dg.H / 2) * PX * k];
      this._icons(b, toPx, k * 2);
      const [ax, ay] = toPx(px, pz);
      this._arrow(b, ax, ay, player.yaw, 4 * k * 1.5);
    }
  }
}
