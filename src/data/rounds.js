// Depths (rounds). Each depth always generates the same dungeon (fixed seed), so a
// cleared depth can be replayed for free to gather oil. Beyond the authored list,
// depths keep scaling.
export const ROUNDS = [
  { n: 1, title: 'The Undercroft', rooms: 8,  beacons: 3, fee: 0,  oilSpills: 7,
    monsters: { stalker: 2 }, maxMonsters: 3, speed: 0.9, learn: ['beam', 'oil'] },
  { n: 2, title: 'The Ossuary', rooms: 9,  beacons: 4, fee: 15, oilSpills: 8,
    monsters: { stalker: 3, hound: 1 }, maxMonsters: 5, speed: 1.0, learn: ['blast'] },
  { n: 3, title: 'The Cisterns', rooms: 10, beacons: 4, fee: 20, oilSpills: 8,
    monsters: { stalker: 2, hound: 1, moth: 2 }, maxMonsters: 6, speed: 1.05, learn: ['throw'] },
  { n: 4, title: 'The Hanging Vaults', rooms: 11, beacons: 5, fee: 25, oilSpills: 9,
    monsters: { stalker: 2, hound: 1, moth: 2, ceiling: 2 }, maxMonsters: 7, speed: 1.1, learn: [] },
];

export function roundConfig(n) {
  const base = ROUNDS[Math.min(n, ROUNDS.length) - 1];
  if (n <= ROUNDS.length) return { ...base, seed: 4219 * n + 17 };
  const extra = n - ROUNDS.length;
  return {
    ...base, n, title: `Depth ${n}`, seed: 4219 * n + 17,
    rooms: Math.min(14, base.rooms + extra), beacons: 5, fee: base.fee + 5 * extra, oilSpills: base.oilSpills + extra,
    monsters: { stalker: 2 + Math.floor(extra / 2), hound: 1 + Math.floor(extra / 3), moth: 2, ceiling: 2 + Math.floor(extra / 2) },
    maxMonsters: base.maxMonsters + extra, speed: Math.min(1.35, base.speed + 0.05 * extra), learn: [],
  };
}

// Abilities known when starting depth n.
export function abilitiesAt(n) {
  const set = new Set();
  for (const r of ROUNDS) if (r.n <= n) r.learn.forEach((a) => set.add(a));
  return set;
}

// Upgrade tracks: costs per level and the value at each level (index = level).
export const UPGRADES = {
  blastPower:    { label: 'Blast heat',      needs: 'blast', costs: [20, 35, 55], values: [1, 1.35, 1.7, 2.1],      unit: '× damage' },
  blastRange:    { label: 'Blast reach',     needs: 'blast', costs: [15, 30, 50], values: [7.5, 9, 10.5, 12],      unit: 'm' },
  blastDuration: { label: 'Blast breath',    needs: 'blast', costs: [20, 35, 55], values: [2.0, 2.5, 3.0, 3.6],    unit: 's' },
  beamReach:     { label: 'Beam reach',      needs: 'beam',  costs: [15, 30, 50], values: [1, 1.2, 1.4, 1.65],     unit: '× range' },
  beamStrength:  { label: 'Beam grip',       needs: 'beam',  costs: [15, 30, 50], values: [1, 1.3, 1.65, 2.0],     unit: '× freeze speed' },
  throwPower:    { label: 'Firebomb',        needs: 'throw', costs: [20, 35, 55], values: [3.0, 3.8, 4.6, 5.4],    unit: 'm radius' },
};
