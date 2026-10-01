// The oil sack during a run. Entering a depth already paid its fee; dying loses
// what was gathered this attempt (but oil spent from the sack stays spent).
import { progress, saveProgress } from '../core/Progress.js';

export class Economy {
  constructor(events) {
    this.events = events;
    this.entry = progress.oil;   // sack when this attempt began (after the fee)
    this.sack = progress.oil;
    this.gathered = 0;
  }

  gain(x) {
    this.sack += x;
    this.gathered += x;
  }

  spend(x) {
    if (this.sack < x) return false;
    this.sack -= x;
    return true;
  }

  // Persist the outcome of the attempt.
  settle(won) {
    progress.oil = Math.floor(won ? this.sack : Math.min(this.sack, this.entry));
    saveProgress();
    this.settled = progress.oil;
    return progress.oil;
  }
}
