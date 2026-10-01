// Applies a depth's difficulty and the bought upgrades to the live tuning.
import { GAME } from '../core/GameConfig.js';
import { settings } from '../core/Settings.js';
import { progress } from '../core/Progress.js';
import { UPGRADES, abilitiesAt } from '../data/rounds.js';

const BASE = { ...GAME };
const BASE_LIGHT = { ...settings.light };

export function upgradeValue(key) {
  return UPGRADES[key].values[progress.upgrades[key] || 0];
}

export function applyLoadout(round) {
  Object.assign(GAME, BASE);
  Object.assign(settings.light, BASE_LIGHT);
  GAME.beacons = round.beacons;
  GAME.monsterSpeed = round.speed;
  GAME.blastDps = BASE.blastDps * upgradeValue('blastPower');
  GAME.blastRange = upgradeValue('blastRange');
  GAME.blastDuration = upgradeValue('blastDuration');
  GAME.beamReachMul = upgradeValue('beamReach');
  GAME.chargeMul = upgradeValue('beamStrength');
  GAME.chargeRate = BASE.chargeRate * GAME.chargeMul;
  GAME.throwRadius = upgradeValue('throwPower');
  GAME.throwBurn = BASE.throwBurn + 2 * (progress.upgrades.throwPower || 0);
  settings.light.focusRange = BASE_LIGHT.focusRange * GAME.beamReachMul;
  settings.light.focusIntensity = BASE_LIGHT.focusIntensity * (0.85 + 0.15 * GAME.chargeMul);
  return abilitiesAt(round.n);
}
