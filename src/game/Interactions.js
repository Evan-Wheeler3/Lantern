// One "E" for everything: beacons, oil, doors, journals, the well, the thrown
// lantern. Each interactable registers itself; the nearest one in front of the
// player wins the prompt.
//
//   { x, z, radius, label: () => string, enabled: () => bool,
//     hold: seconds (0 = continuous while held), onHold(dt), onComplete(), priority }
export class Interactions {
  constructor() {
    this.list = [];
    this.current = null;
    this.progress = 0;
    this._latched = false; // after a completion, E must be released first
  }

  add(it) {
    this.list.push({ priority: 0, hold: 0.6, enabled: () => true, ...it });
    return this.list[this.list.length - 1];
  }

  remove(it) {
    const i = this.list.indexOf(it);
    if (i >= 0) this.list.splice(i, 1);
  }

  update(dt, player, game) {
    if (game.state !== 'playing' || game.paused) { this.current = null; return; }
    const px = player.feet.x, pz = player.feet.z;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    let best = null, bestScore = Infinity;
    for (const it of this.list) {
      if (!it.enabled()) continue;
      const dx = it.x - px, dz = it.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      const facing = d > 0.3 ? (dx * fx + dz * fz) / d : 1;
      if (facing < -0.2) continue;
      const score = d - facing * 0.8 - it.priority;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best !== this.current) { this.progress = 0; this.current = best; }
    if (!player.interactHeld) this._latched = false;
    if (!best) return;

    if (player.interactHeld && !this._latched) {
      if (best.hold === 0) {
        best.onHold?.(dt);
        this.progress = best.progressFn ? best.progressFn() : 0;
      } else {
        this.progress = Math.min(1, this.progress + dt / best.hold);
        if (this.progress >= 1) {
          this.progress = 0;
          this._latched = true;
          best.onComplete?.();
        }
      }
    } else if (best.hold !== 0) {
      this.progress = Math.max(0, this.progress - dt * 2.5);
    } else {
      best.onRelease?.();
    }
  }

  get prompt() {
    if (!this.current) return null;
    return { label: this.current.label(), progress: this.progress, continuous: this.current.hold === 0 };
  }
}
