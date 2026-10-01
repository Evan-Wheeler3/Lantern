// Static "shadow creature" silhouettes. Pure black mass + thin ember rim (creature shader).
// Built from limbs/ellipsoids so the silhouette has long, wrong proportions.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { finalize, merge, limb, ball, mat } from './geo.js';

const C = { tone: 0, gloss: 0 };

function fingers(parts, wrist, dir, spread, len, rand) {
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * spread;
    const tip = [
      wrist[0] + dir[0] * len + Math.sin(a) * len * 0.5,
      wrist[1] + dir[1] * len * (0.9 + rand() * 0.3),
      wrist[2] + dir[2] * len + Math.cos(a) * len * 0.25,
    ];
    parts.push(finalize(limb(wrist, tip, 0.018, 0.003, 5), C));
  }
}

// ~3.1 m tall, gaunt, cloaked, antlered. Origin at its feet; faces +Z.
export function buildTallOne() {
  const rand = mulberry32(31);
  const P = [];
  const add = (g) => P.push(finalize(g, C));
  // legs (digitigrade-ish)
  for (const s of [-1, 1]) {
    add(limb([s * 0.13, 1.45, 0], [s * 0.17, 0.78, 0.1], 0.07, 0.05, 8));
    add(limb([s * 0.17, 0.78, 0.1], [s * 0.14, 0.12, -0.06], 0.05, 0.035, 8));
    add(limb([s * 0.14, 0.12, -0.06], [s * 0.15, -0.25, 0.12], 0.035, 0.02, 6));
  }
  // cloak: open cone with a torn hem
  const cloak = new THREE.CylinderGeometry(0.2, 0.58, 1.55, 18, 8, true);
  const p = cloak.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const t = (0.775 - y) / 1.55; // 0 top .. 1 hem
    const tear = t > 0.85 ? (0.25 + 0.35 * Math.abs(Math.sin(a * 5.0 + 1.3)) + rand() * 0.2) * (t - 0.85) / 0.15 : 0;
    const flare = 1 + 0.12 * Math.sin(a * 3.0) * t;
    p.setXYZ(i, p.getX(i) * flare, y + tear, p.getZ(i) * flare);
  }
  cloak.applyMatrix4(mat([0, 1.6, -0.02], [0.1, 0, 0]));
  add(cloak);
  // chest / shoulders
  add(ball([0, 2.32, 0.03], 0.24, 1.25, 0.7, 0.7, 12));
  add(limb([0, 2.38, 0.05], [0, 2.62, 0.16], 0.06, 0.045, 8));
  // head: long, tilted
  const head = new THREE.SphereGeometry(0.1, 12, 10);
  head.applyMatrix4(mat([0.03, 2.75, 0.22], [0.5, 0, -0.3], [1, 1.75, 1.2]));
  add(head);
  // antlers
  for (const s of [-1, 1]) {
    const b = [0.03 + s * 0.06, 2.85, 0.2];
    const m = [0.03 + s * 0.24, 3.12, 0.12];
    const t = [0.03 + s * 0.3, 3.35, 0.02];
    add(limb(b, m, 0.02, 0.014, 5));
    add(limb(m, t, 0.014, 0.003, 5));
    add(limb(m, [m[0] + s * 0.14, m[1] + 0.1, m[2] + 0.08], 0.011, 0.002, 5));
    add(limb([b[0] + s * 0.1, 2.97, 0.17], [b[0] + s * 0.06, 3.15, 0.24], 0.01, 0.002, 5));
  }
  // arms: too long, hanging past the knees
  for (const s of [-1, 1]) {
    const sh = [s * 0.27, 2.3, 0.04];
    const el = [s * 0.42, 1.55, 0.1];
    const wr = [s * 0.38, 0.85, 0.2];
    add(limb(sh, el, 0.05, 0.035, 8));
    add(limb(el, wr, 0.035, 0.025, 8));
    fingers(P, wr, [s * 0.05, -1, 0.1], 0.25, 0.32, rand);
  }
  return merge(P);
}

// Kneeling in the water, bowed toward the beacon. ~1.3 m tall. Faces +Z.
export function buildMourner() {
  const rand = mulberry32(57);
  const P = [];
  const add = (g) => P.push(finalize(g, C));
  add(limb([0, 0.3, -0.1], [0, 1.05, 0.28], 0.2, 0.17, 12));       // hunched torso
  add(ball([0, 1.08, 0.3], 0.22, 1.3, 0.8, 1.0, 12));               // shoulders
  const head = new THREE.SphereGeometry(0.11, 12, 10);
  head.applyMatrix4(mat([0, 1.0, 0.6], [-0.9, 0, 0.15], [1, 1.5, 1.15]));
  add(head);
  add(limb([0, 1.1, 0.38], [0, 1.04, 0.56], 0.07, 0.055, 8));
  // spine ridge
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const base = [0, 0.45 + t * 0.7, -0.12 + t * 0.32];
    add(limb(base, [base[0], base[1] + 0.12 + rand() * 0.12, base[2] - 0.12], 0.035, 0.002, 5));
  }
  // arms reaching into the water
  for (const s of [-1, 1]) {
    const sh = [s * 0.27, 1.06, 0.34];
    const el = [s * 0.42, 0.55, 0.52];
    const wr = [s * 0.34, 0.02, 0.78];
    add(limb(sh, el, 0.055, 0.04, 8));
    add(limb(el, wr, 0.04, 0.028, 8));
    fingers(P, wr, [s * 0.05, -0.6, 0.4], 0.3, 0.25, rand);
    // folded legs
    add(limb([s * 0.15, 0.32, -0.05], [s * 0.22, 0.02, 0.38], 0.09, 0.06, 8));
    add(limb([s * 0.22, 0.02, 0.38], [s * 0.2, -0.15, -0.3], 0.06, 0.04, 8));
  }
  // ragged drape down the back
  const drape = new THREE.CylinderGeometry(0.15, 0.4, 0.9, 12, 4, true, Math.PI * 0.6, Math.PI * 0.8);
  drape.applyMatrix4(mat([0, 0.65, 0.02], [-0.35, Math.PI, 0]));
  add(drape);
  return merge(P);
}
