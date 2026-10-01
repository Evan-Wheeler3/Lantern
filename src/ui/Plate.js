// Story "plates": a printed page over the scene. The world holds its breath while
// one is open. Queue-able (intro, then an ability lesson).
const PAL = { ink: '#07060A', oil: '#1A1210', ember: '#FF8A1F', cream: '#FFE2B0' };

function drawEmblem(c, kind, seed) {
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  g.fillStyle = PAL.ink; g.fillRect(0, 0, w, h);
  // woodcut rays
  g.strokeStyle = PAL.ember; g.lineWidth = 2;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2 + seed;
    const r0 = 34 + (k % 3) * 6, r1 = 60 + ((k * 37) % 23);
    g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
    g.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1); g.stroke();
  }
  g.fillStyle = PAL.cream;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? 11 : 27;
    const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
    if (k) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  if (kind === 'teach') {
    g.strokeStyle = PAL.cream; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h / 2, 30, 0, Math.PI * 2); g.stroke();
  }
}

export class Plates {
  constructor(game, events) {
    this.game = game;
    this.events = events;
    this.el = document.getElementById('plate');
    this.title = document.getElementById('plate-title');
    this.body = document.getElementById('plate-body');
    this.emblem = document.getElementById('plate-emblem');
    this.queue = [];
    this.open = false;
    this._openedAt = 0;
    const close = () => {
      if (!this.open || performance.now() - this._openedAt < 450) return;
      this._close();
    };
    window.addEventListener('keydown', (e) => { if (['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code)) close(); });
    this.el.addEventListener('click', close);
    window.addEventListener('mousedown', () => close());
  }

  show(beat, kind = 'story') {
    this.queue.push({ beat, kind });
    if (!this.open) this._next();
  }

  _next() {
    const p = this.queue.shift();
    if (!p) return;
    this.open = true;
    this._openedAt = performance.now();
    this.game.paused = true;
    this.title.textContent = p.beat.title;
    this.body.innerHTML = '';
    for (const para of p.beat.text.split('\n\n')) {
      const d = document.createElement('p');
      d.textContent = para;
      this.body.appendChild(d);
    }
    drawEmblem(this.emblem, p.kind, p.beat.title.length);
    this.el.classList.remove('hidden');
    this.events.emit('plateOpen', { kind: p.kind });
  }

  _close() {
    this.open = false;
    this.el.classList.add('hidden');
    this.game.paused = false;
    this.events.emit('plateClose', {});
    if (this.queue.length) setTimeout(() => this._next(), 250);
  }
}
