// Woodcut HUD: beacons, remaining flames (hits), oil sack, fire meter, firebomb
// charge, the interaction prompt, messages, and the end card.
import { GAME } from '../core/GameConfig.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.obj = $('hud-objective');
    this.oil = $('hud-oil');
    this.flames = $('hud-flames');
    this.meter = $('hud-meter');
    this.meterFill = $('hud-meter-fill');
    this.meterLabel = $('hud-meter-label');
    this.prompt = $('hud-prompt');
    this.promptText = $('hud-prompt-text');
    this.promptFill = $('hud-prompt-fill');
    this.msgs = $('hud-messages');
    this.end = $('endcard');
    this.flameEls = [];
    for (let k = 0; k < GAME.maxHits; k++) {
      const d = document.createElement('div');
      d.className = 'flame-pip';
      this.flames.appendChild(d);
      this.flameEls.push(d);
    }
    this._msgKey = '';
    this._ended = false;
  }

  update(game, lantern, ctx) {
    const { beacons, interactions, economy, abilities, firebomb, doors, round } = ctx;
    this.root.classList.toggle('hidden', game.state !== 'playing');

    this.obj.textContent = doors.unlocked
      ? (doors.open > 0 ? 'Depth ' + round.n + ' — the way down is open' : 'The great door is unbarred — find it')
      : `Depth ${round.n}  ·  Beacons kindled  ${beacons.litCount} / ${beacons.total}`;
    this.oil.textContent = `Oil  ${Math.floor(economy.sack)}${economy.gathered >= 1 ? `   (+${Math.floor(economy.gathered)} this descent)` : ''}`;

    this.flameEls.forEach((el, k) => el.classList.toggle('lost', k >= GAME.maxHits - game.hits));

    // fire meter (only once the blast is known); firebomb charge borrows it
    const hasBlast = abilities.has('blast');
    const charging = firebomb.state === 'charging' || firebomb.state === 'priming';
    this.meter.classList.toggle('hidden', !hasBlast && !charging);
    let m = lantern.burnout ? lantern.recover : lantern.fuel;
    if (charging) m = firebomb.state === 'priming' ? 0 : firebomb.charge;
    this.meterFill.style.width = `${(m * 100).toFixed(1)}%`;
    this.meter.classList.toggle('burnout', lantern.burnout && !charging);
    this.meter.classList.toggle('blasting', lantern.blasting || charging);
    this.meterLabel.textContent = charging ? (firebomb.state === 'priming' ? 'dousing the lantern…' : 'release Q to throw')
      : lantern.thrown ? 'your lantern lies in the fire'
      : lantern.burnout ? 'BURNT OUT — mash SPACE' : '';

    const p = interactions.prompt;
    this.prompt.classList.toggle('hidden', !p || game.state !== 'playing' || game.paused);
    if (p) {
      this.promptText.textContent = p.label;
      this.promptFill.style.width = `${(p.progress * 100).toFixed(0)}%`;
    }

    const key = game.messages.map((x) => x.text).join('|');
    if (key !== this._msgKey) {
      this._msgKey = key;
      this.msgs.innerHTML = '';
      for (const x of game.messages) {
        const d = document.createElement('div');
        d.textContent = x.text;
        this.msgs.appendChild(d);
        x.el = d;
      }
    }
    for (const x of game.messages) if (x.el) x.el.style.opacity = String(Math.max(0, Math.min(1, x.hold + 1.2 - x.t)));

    if ((game.state === 'dead' || game.state === 'won') && !this._ended) {
      this._ended = true;
      const won = game.state === 'won';
      const min = Math.floor(game.time / 60), sec = Math.floor(game.time % 60).toString().padStart(2, '0');
      $('end-title').textContent = won ? `Depth ${round.n} — you found the way down.` : 'The flame is out.';
      const g = Math.floor(economy.gathered);
      $('end-stats').textContent = `${game.lit} of ${game.total} beacons kindled · ${game.kills} shadows burned · ${min}:${sec}`;
      $('end-oil').textContent = won
        ? `You carry ${Math.floor(economy.settled)} oil back up the well${g ? ` (+${g} gathered)` : ''}.`
        : g ? `The ${g} oil you gathered is lost in the dark. ${Math.floor(economy.settled)} remain in the sack.` : `${Math.floor(economy.settled)} oil remain in the sack.`;
      setTimeout(() => this.end.classList.remove('hidden'), 1800);
    }
  }
}
