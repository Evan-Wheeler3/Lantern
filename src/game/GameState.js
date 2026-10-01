// Run state: title -> playing -> dead | won. Tracks hits and objective progress,
// and drives the full-screen print effects (hurt pulse, fade to ink).
import { GAME } from '../core/GameConfig.js';

export class GameState {
  constructor(events, totalBeacons, seed) {
    this.events = events;
    this.state = 'title';
    this.seed = seed;
    this.hits = 0;
    this.invuln = 0;
    this.hurt = 0;
    this.fade = 0;
    this.lit = 0;
    this.total = totalBeacons;
    this.kills = 0;
    this.time = 0;
    this.messages = []; // { text, t } for the HUD

    events.on('playerHit', () => {
      if (this.state !== 'playing' || this.invuln > 0) return;
      this.hits++;
      this.invuln = GAME.invulnerable;
      this.hurt = 1;
      this.events.emit('hurt', { hits: this.hits });
      if (this.hits >= GAME.maxHits) this.end('dead');
      else this.say(this.hits === GAME.maxHits - 1 ? 'The flame gutters. One more touch and it dies.' : 'Something cold touched the flame.');
    });
    events.on('beaconLit', ({ count, total }) => {
      this.lit = count;
      if (this.hits > 0) this.hits--;
      this.say(count < total ? `Beacon kindled — ${count} of ${total}` : 'Every beacon burns. The seal is breaking.');
    });
    events.on('allLit', () => this.say('Find the opened door.', 3.5));
    events.on('monsterKilled', () => { this.kills++; });
    events.on('escaped', () => this.end('won'));
    events.on('burnout', () => this.say('Burnt out — mash SPACE to pump the oil', 2.2));
  }

  start() {
    if (this.state !== 'title') return;
    this.state = 'playing';
    this.say(`Kindle the ${this.total} beacons. Then find the way out.`, 5);
  }

  end(result) {
    if (this.state !== 'playing') return;
    this.state = result;
    this.events.emit(result === 'won' ? 'won' : 'died', {});
  }

  say(text, hold = 2.6) {
    this.messages.push({ text, t: 0, hold });
    if (this.messages.length > 3) this.messages.shift();
  }

  update(dt) {
    if (this.state === 'playing') this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    if (this.state === 'dead') this.fade = Math.min(0.92, this.fade + dt / 2.5);
    if (this.state === 'won') this.fade = Math.min(0.85, this.fade + dt / 2.0);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < m.hold + 1.2);
  }
}
