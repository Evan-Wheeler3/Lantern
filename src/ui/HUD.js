// Woodcut HUD: beacon count, remaining flames (hits), fire meter, prompts,
// messages, and the end cards. Plain DOM, palette colours only.
import { GAME } from '../core/GameConfig.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.obj = $('hud-objective');
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

  update(game, lantern, beacons) {
    this.root.classList.toggle('hidden', game.state !== 'playing');

    this.obj.textContent = beacons.doorUnsealed
      ? 'The seal is broken — find the open door'
      : `Beacons kindled  ${beacons.litCount} / ${beacons.total}`;

    this.flameEls.forEach((el, k) => el.classList.toggle('lost', k >= GAME.maxHits - game.hits));

    const m = lantern.burnout ? lantern.recover : lantern.fuel;
    this.meterFill.style.width = `${(m * 100).toFixed(1)}%`;
    this.meter.classList.toggle('burnout', lantern.burnout);
    this.meter.classList.toggle('blasting', lantern.blasting);
    this.meterLabel.textContent = lantern.burnout ? 'BURNT OUT — mash SPACE' : '';

    const p = beacons.prompt;
    this.prompt.classList.toggle('hidden', !p || game.state !== 'playing');
    if (p) {
      this.promptText.textContent = p.kind === 'kindle' ? 'Hold  E  to kindle the beacon' : 'Step through the door';
      this.promptFill.style.width = p.kind === 'kindle' ? `${(p.progress * 100).toFixed(0)}%` : '0%';
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
      const min = Math.floor(game.time / 60), sec = Math.floor(game.time % 60).toString().padStart(2, '0');
      $('end-title').textContent = game.state === 'won' ? 'You walked out of the dark.' : 'The flame is out.';
      $('end-stats').textContent = `${game.lit} of ${game.total} beacons kindled · ${game.kills} shadows burned · ${min}:${sec} · seed ${game.seed}`;
      setTimeout(() => this.end.classList.remove('hidden'), 1800);
    }
  }
}
