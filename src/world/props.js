// Reusable architectural props. Each takes an `add(geometry, materialOpts)` sink so
// it can feed any merged/chunked build. Positions are world space, floor at FLOOR_Y.
import * as THREE from 'three';
import { mat, limb } from './geo.js';

export const FLOOR_Y = -0.22;
export const STONE = { tone: 0.78, gloss: 0.12 };
export const DARK_STONE = { tone: 0.55, gloss: 0.2 };
export const IRON = { tone: 0.6, gloss: 0.75 };
export const COAL = { tone: 0.22, gloss: 0.3 };

// Gothic clustered pier. Returns the height of its top (spring line).
export function pier(add, x, z, h, rand, broken = false) {
  const seed = Math.round(x * 7 + z * 13);
  add(new THREE.BoxGeometry(1.25, 0.7, 1.25, 2, 1, 2), { ...STONE, matrix: mat([x, -0.15, z], [0, Math.PI / 4, 0]), disp: 0.03 });
  add(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 16), { ...STONE, matrix: mat([x, 0.35, z]) });
  const core = new THREE.CylinderGeometry(0.42, 0.44, h, 14, Math.ceil(h * 2), false);
  if (broken) {
    const p = core.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > h / 2 - 0.01) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, h / 2 - (0.15 + 0.5 * Math.abs(Math.sin(a * 2.5 + seed))) * (0.6 + rand() * 0.6));
      }
    }
  }
  add(core, { ...STONE, matrix: mat([x, 0.5 + h / 2, z]), disp: 0.035, dispScale: 1.8, seed });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const sh = broken ? h * (0.55 + rand() * 0.4) : h;
    add(new THREE.CylinderGeometry(0.13, 0.14, sh, 7, Math.ceil(sh * 1.5)), {
      ...STONE, matrix: mat([x + Math.cos(a) * 0.45, 0.5 + sh / 2, z + Math.sin(a) * 0.45]), disp: 0.02, dispScale: 2.5, seed: seed + k,
    });
  }
  if (broken) {
    for (let i = 0; i < 5; i++) {
      const r = 0.18 + rand() * 0.32;
      add(new THREE.DodecahedronGeometry(r, 0), {
        ...STONE, flat: true, matrix: mat([x + (rand() - 0.5) * 3, r * 0.2, z + (rand() - 0.5) * 3], [rand() * 3, rand() * 3, rand() * 3]),
      });
    }
    return 0;
  }
  add(new THREE.CylinderGeometry(0.72, 0.5, 0.45, 14), { ...STONE, matrix: mat([x, 0.5 + h + 0.22, z]) });
  add(new THREE.BoxGeometry(1.5, 0.2, 1.5), { ...STONE, matrix: mat([x, 0.5 + h + 0.55, z]) });
  return 0.5 + h + 0.65;
}

// Short crypt column with a cushion capital, reaching the ceiling.
export function cryptColumn(add, x, z, ceil) {
  const h = ceil - 0.9;
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.4, 8), { ...STONE, flat: true, matrix: mat([x, 0.0, z]) });
  add(new THREE.CylinderGeometry(0.28, 0.3, h, 10, Math.ceil(h * 2)), { ...STONE, matrix: mat([x, 0.2 + h / 2, z]), disp: 0.02 });
  add(new THREE.CylinderGeometry(0.55, 0.3, 0.4, 8), { ...STONE, flat: true, matrix: mat([x, 0.2 + h + 0.2, z]) });
  add(new THREE.BoxGeometry(1.1, 0.25, 1.1), { ...STONE, matrix: mat([x, 0.2 + h + 0.5, z]) });
}

export function rubble(add, x, z, rand, n = 5, spread = 1.5) {
  for (let i = 0; i < n; i++) {
    const r = 0.12 + rand() * 0.32;
    add(new THREE.DodecahedronGeometry(r, 0), {
      ...STONE, flat: true, matrix: mat([x + (rand() - 0.5) * spread * 2, r * 0.2, z + (rand() - 0.5) * spread * 2], [rand() * 3, rand() * 3, rand() * 3]),
    });
  }
}

export function sarcophagus(add, x, z, rotY, rand) {
  const lidOff = rand() < 0.5 ? 0.35 + rand() * 0.2 : 0;
  add(new THREE.BoxGeometry(2.1, 0.9, 0.9, 3, 1, 1), { ...STONE, matrix: mat([x, 0.2, z], [0, rotY, 0]), disp: 0.02 });
  const c = Math.cos(rotY), s = Math.sin(rotY);
  add(new THREE.BoxGeometry(2.25, 0.16, 1.0), {
    ...STONE, matrix: mat([x + c * lidOff * 0.6, 0.73 - (lidOff ? 0.06 : 0), z - s * lidOff * 0.6], [0, rotY + lidOff * 0.4, lidOff ? 0.12 : 0]),
  });
}

export function font(add, fx, fz) {
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 8), { ...STONE, flat: true, matrix: mat([fx, -0.05, fz]) });
  add(new THREE.CylinderGeometry(0.2, 0.28, 0.75, 8, 3), { ...STONE, flat: true, matrix: mat([fx, 0.45, fz]), disp: 0.015 });
  const prof = [[0.12, 0], [0.4, 0.05], [0.58, 0.2], [0.64, 0.38], [0.6, 0.4], [0.52, 0.24], [0.3, 0.12], [0.05, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const basin = new THREE.LatheGeometry(prof, 8);
  const bp = basin.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getZ(i), bp.getX(i));
    if (bp.getY(i) > 0.3 && Math.abs(a - 0.6) < 0.5) bp.setY(i, 0.18 + Math.abs(a - 0.6) * 0.25);
  }
  add(basin, { ...STONE, flat: true, matrix: mat([fx, 0.8, fz], [0.08, 0.3, -0.05]) });
  add(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 8), { ...DARK_STONE, gloss: 1, matrix: mat([fx, 1.06, fz]) });
}

// Iron tripod brazier. Returns the world position where its fire burns.
export function tripodBeacon(add, bx, bz, rand) {
  const top = 1.35;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand() * 6;
    add(limb([bx + Math.cos(a) * 0.42, FLOOR_Y, bz + Math.sin(a) * 0.42], [bx + Math.cos(a) * 0.14, top, bz + Math.sin(a) * 0.14], 0.035, 0.028, 6), { ...IRON });
    add(new THREE.ConeGeometry(0.06, 0.18, 5), { ...IRON, flat: true, matrix: mat([bx + Math.cos(a) * 0.45, 0.05, bz + Math.sin(a) * 0.45], [0, 0, Math.PI]) });
  }
  add(new THREE.TorusGeometry(0.24, 0.025, 6, 20), { ...IRON, matrix: mat([bx, 0.75, bz], [Math.PI / 2, 0, 0]) });
  const prof = [[0.06, 0], [0.2, 0.06], [0.36, 0.16], [0.46, 0.28], [0.5, 0.32], [0.47, 0.33], [0.4, 0.22], [0.2, 0.1], [0.05, 0.06]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 18), { ...IRON, matrix: mat([bx, top - 0.05, bz]) });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add(limb([bx + Math.cos(a) * 0.46, top + 0.26, bz + Math.sin(a) * 0.46], [bx + Math.cos(a) * 0.36, top + 0.62 + rand() * 0.15, bz + Math.sin(a) * 0.36], 0.022, 0.004, 5), { ...IRON });
  }
  for (let i = 0; i < 6; i++) add(new THREE.IcosahedronGeometry(0.08 + rand() * 0.06, 0), { ...COAL, flat: true, matrix: mat([bx + (rand() - 0.5) * 0.4, top + 0.2, bz + (rand() - 0.5) * 0.4], [rand() * 3, rand() * 3, 0]) });
  return new THREE.Vector3(bx, top + 0.22, bz);
}

// Stone pedestal + great iron bowl. Returns the fire position.
export function greatBeacon(add, bx, bz, rand) {
  const base = FLOOR_Y + 0.3;
  add(new THREE.CylinderGeometry(0.75, 0.85, 0.6, 8), { ...STONE, flat: true, matrix: mat([bx, base, bz]) });
  add(new THREE.CylinderGeometry(0.42, 0.55, 1.5, 8, 4), { ...STONE, flat: true, matrix: mat([bx, base + 1.05, bz]), disp: 0.02 });
  add(new THREE.CylinderGeometry(0.62, 0.45, 0.25, 8), { ...STONE, flat: true, matrix: mat([bx, base + 1.9, bz]) });
  const prof = [[0.1, 0], [0.45, 0.08], [0.78, 0.26], [0.92, 0.44], [0.98, 0.5], [0.93, 0.52], [0.8, 0.34], [0.4, 0.14], [0.08, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 24), { ...IRON, matrix: mat([bx, base + 2.0, bz]) });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(limb([bx + Math.cos(a) * 0.95, base + 2.45, bz + Math.sin(a) * 0.95], [bx + Math.cos(a) * 1.25, base + 3.2, bz + Math.sin(a) * 1.25], 0.05, 0.005, 6), { ...IRON });
  }
  for (let i = 0; i < 12; i++) add(new THREE.IcosahedronGeometry(0.1 + rand() * 0.1, 0), { ...COAL, flat: true, matrix: mat([bx + (rand() - 0.5) * 1.0, base + 2.4, bz + (rand() - 0.5) * 1.0], [rand() * 3, rand() * 3, 0]) });
  return new THREE.Vector3(bx, base + 2.45, bz);
}
