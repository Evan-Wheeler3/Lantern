// Gameplay tuning in one place (style lives in Settings.js).
export const GAME = {
  beacons: 5,
  rooms: 10,

  // player
  maxHits: 3,              // touches before the flame goes out
  invulnerable: 1.6,       // s after a hit
  kindleRadius: 2.4,       // m from a beacon to kindle it
  kindleTime: 0.9,         // s holding E

  // fire blast (right mouse) through the lantern
  blastDuration: 2.0,      // s of continuous blast from a full meter (upgradeable)
  fuelRegen: 0.32,         // per second when idle
  fuelRegenDelay: 0.5,     // s after releasing before regen starts
  burnoutTime: 4.0,        // s to recover from a burnout unaided
  pumpBoost: 0.09,         // recovery per Space press
  blastRange: 7.5,         // m
  blastCos: 0.92,          // cone (cos of half-angle, ~23 deg)
  blastDps: 2.4,           // damage per second (monster hp ~2.5-3.5)
  blastFrozenMul: 1.6,     // extra damage to frozen monsters
  blastKnock: 3.5,         // m/s push

  // beam freeze
  chargeRate: 0.55,        // per second fully in the beam
  chargeDecay: 0.3,
  freezeTime: 5.0,

  // monsters
  monstersStart: 4,
  monstersMaxBase: 4,      // + beacons lit
  respawnEvery: 22,        // s
  aggroDist: 55,           // weighted path distance (~m) at which they start hunting
  attackRange: 0.95,
  monsterSpeed: 1.0,       // per-depth multiplier

  // oil (the only resource)
  oilGatherRate: 9,        // oil per second while scooping
  stowTime: 0.45,          // s to hang the lantern and get both hands into the oil
  throwCost: 6,
  throwRadius: 3.0,        // m (upgradeable)
  throwBurn: 9,            // s the pool burns
  throwDps: 2.2,
  beamReachMul: 1,
  chargeMul: 1,
};
