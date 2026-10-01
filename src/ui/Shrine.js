// The shrine at the top of the well: between depths. Shows the oil sack, the
// depths you can enter (cleared ones are free), and the upgrade shop.
import { progress, saveProgress, resetProgress } from '../core/Progress.js';
import { roundConfig, abilitiesAt, UPGRADES } from '../data/rounds.js';

const PAID_KEY = 'lanternkeeper.paid';

export function consumePaidTicket(n) {
  try {
    const v = sessionStorage.getItem(PAID_KEY);
    sessionStorage.removeItem(PAID_KEY);
    return v === String(n);
  } catch { return false; }
}

export class Shrine {
  constructor(root) {
    this.root = root;
    this.selected = Math.min(progress.passed + 1, progress.passed + 1);
    this.render();
  }

  fee(n) {
    return n <= progress.passed ? 0 : roundConfig(n).fee;
  }

  render() {
    const r = this.root;
    const next = progress.passed + 1;
    const known = abilitiesAt(next);
    const depths = [];
    for (let n = 1; n <= next; n++) depths.push(n);
    const fee = this.fee(this.selected);
    const canGo = progress.oil >= fee;
    r.innerHTML = `
      <h1>LANTERNKEEPER</h1>
      <div class="sub">the shrine at the top of the well</div>
      <div class="oil">Oil in the sack: <b>${Math.floor(progress.oil)}</b></div>
      <div class="cols">
        <div class="col">
          <h3>Descend</h3>
          ${depths.map((n) => {
            const c = roundConfig(n);
            const cleared = n <= progress.passed;
            return `<label class="depth ${n === this.selected ? 'sel' : ''}"><input type="radio" name="depth" value="${n}" ${n === this.selected ? 'checked' : ''}/>
              <span class="dn">Depth ${n}</span> <span class="dt">${c.title}</span>
              <span class="df">${cleared ? 'cleared · free' : c.fee ? `toll ${c.fee} oil` : 'no toll'}</span></label>`;
          }).join('')}
          <button id="shrine-go" ${canGo ? '' : 'disabled'}>Take up the lantern</button>
          <div class="warn">${canGo ? '' : `You need ${fee} oil for this depth. Return to a cleared depth and gather more.`}</div>
        </div>
        <div class="col">
          <h3>The keepers' craft</h3>
          ${Object.entries(UPGRADES).filter(([, u]) => known.has(u.needs)).map(([k, u]) => {
            const lvl = progress.upgrades[k] || 0;
            const maxed = lvl >= u.costs.length;
            const cost = maxed ? 0 : u.costs[lvl];
            return `<div class="upg"><span class="ul">${u.label}</span>
              <span class="dots">${u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>
              <span class="uv">${u.values[lvl]} ${u.unit}</span>
              <button data-upg="${k}" ${maxed || progress.oil < cost ? 'disabled' : ''}>${maxed ? 'mastered' : `${cost} oil`}</button></div>`;
          }).join('') || '<div class="none">Nothing yet. Go down.</div>'}
        </div>
      </div>
      <div class="keys">
        <b>WASD</b> wade · <b>Shift</b> hurry · <b>Left click</b>/<b>F</b> beam · <b>E</b> kindle / gather / open
        ${known.has('blast') ? ' · <b>Right click</b> (hold) star blast · <b>Space</b> pump after burnout' : ''}
        ${known.has('throw') ? ' · <b>Q</b> (hold) firebomb' : ''} · <b>M</b> map
      </div>
      <a class="reset" href="#" id="shrine-reset">forget everything</a>`;
    r.querySelectorAll('input[name=depth]').forEach((el) => el.addEventListener('change', () => { this.selected = Number(el.value); this.render(); }));
    r.querySelectorAll('button[data-upg]').forEach((el) => el.addEventListener('click', () => {
      const k = el.dataset.upg;
      const lvl = progress.upgrades[k] || 0;
      const cost = UPGRADES[k].costs[lvl];
      if (progress.oil >= cost) { progress.oil -= cost; progress.upgrades[k] = lvl + 1; saveProgress(); this.render(); }
    }));
    r.querySelector('#shrine-go')?.addEventListener('click', () => this.go());
    r.querySelector('#shrine-reset').addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Forget all progress, oil and upgrades?')) { resetProgress(); this.selected = 1; this.render(); }
    });
  }

  go() {
    const n = this.selected;
    const fee = this.fee(n);
    if (progress.oil < fee) return;
    progress.oil -= fee;
    saveProgress();
    try { sessionStorage.setItem(PAID_KEY, String(n)); } catch { /* ignore */ }
    const p = new URLSearchParams(location.search);
    p.set('round', String(n));
    location.search = p.toString();
  }
}
