// Engine: owns the clock and an ordered list of systems. A system is any object
// with optional `update(dt, time, engine)` and `resize(w, h)` methods.
// Rendering is just the last system. Gameplay (AI, beacons, inventory...) will be
// added as further systems without touching the renderer.

import { EventBus } from './EventBus.js';

export class Engine {
  constructor() {
    this.events = new EventBus();
    this.systems = [];
    this.time = 0;
    this.frame = 0;
    this.running = false;
    this._last = 0;
    this._loop = this._loop.bind(this);
    this.services = {}; // named shared objects: world, player, lantern, pipeline, audio...
  }

  add(system, name) {
    this.systems.push(system);
    if (name) this.services[name] = system;
    return system;
  }

  start() {
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }

  resize(w, h) {
    for (const s of this.systems) s.resize?.(w, h);
  }

  _loop(now) {
    if (!this.running) return;
    // Clamp dt: tab switches or shader compiles must not teleport the player, and
    // the first rAF timestamp can precede start()'s performance.now() — a negative
    // dt makes every exponential smoother in the game diverge.
    const dt = Math.min(Math.max((now - this._last) / 1000, 0), 1 / 20);
    this._last = now;
    this.time += dt;
    this.frame++;
    for (const s of this.systems) s.update?.(dt, this.time, this);
    requestAnimationFrame(this._loop);
  }
}
