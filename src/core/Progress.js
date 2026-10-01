// Persistent progress (localStorage): oil in the sack, deepest round cleared,
// upgrades bought, abilities learned, story plates seen.
const KEY = 'lanternkeeper.progress.v1';

const FRESH = {
  oil: 10,
  passed: 0,                 // highest round completed
  upgrades: { blastPower: 0, blastRange: 0, blastDuration: 0, beamReach: 0, beamStrength: 0, throwPower: 0 },
  seen: [],                  // story/tutorial ids already shown
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(FRESH);
    const p = JSON.parse(raw);
    return { ...structuredClone(FRESH), ...p, upgrades: { ...FRESH.upgrades, ...(p.upgrades || {}) } };
  } catch {
    return structuredClone(FRESH);
  }
}

export const progress = load();

export function saveProgress() {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* private mode: progress lasts the session */ }
}

export function resetProgress() {
  Object.assign(progress, structuredClone(FRESH));
  saveProgress();
}

export function markSeen(id) {
  if (!progress.seen.includes(id)) { progress.seen.push(id); saveProgress(); }
}
