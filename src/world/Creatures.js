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

// Moth: a narrow body and two broad, ragged wings (separate geometries so they
// can flap). Wings are built in +X; mirror for the other side. Faces +Z.
export function buildMoth() {
  const rand = mulberry32(91);
  const B = [];
  const add = (g) => B.push(finalize(g, C));
  add(ball([0, 0, 0], 0.16, 0.8, 0.8, 2.4, 10));            // thorax/abdomen along z
  add(ball([0, 0.02, 0.36], 0.09, 1, 1, 1.1, 8));            // head
  for (const s of [-1, 1]) {
    add(limb([s * 0.03, 0.06, 0.42], [s * 0.18, 0.28, 0.62], 0.012, 0.003, 4)); // antennae
    add(limb([s * 0.18, 0.28, 0.62], [s * 0.3, 0.3, 0.6], 0.004, 0.002, 4));
  }
  const body = merge(B);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.12);
  const pts = [[0.35, 0.35], [0.75, 0.42], [1.05, 0.25], [1.12, 0.0], [0.95, -0.25], [0.7, -0.5], [0.45, -0.62], [0.2, -0.45], [0, -0.15]];
  for (const [x, y] of pts) shape.lineTo(x * (0.95 + rand() * 0.1), y * (0.95 + rand() * 0.1));
  // eye-spot hole
  const hole = new THREE.Path();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const v = [0.62 + Math.cos(a) * 0.09, 0.02 + Math.sin(a) * 0.09]; if (k) hole.lineTo(...v); else hole.moveTo(...v); }
  shape.holes.push(hole);
  const wg = new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: false });
  wg.rotateX(-Math.PI / 2); // lie flat, span +x, length along z
  const wing = finalize(wg, C);
  return { body, wing };
}

// Ceiling crawler: a long flat body slung between eight jointed legs.
// Built upright (legs down); it is flipped to hang from vaults. Faces +Z.
export function buildCeilingCrawler() {
  const P = [];
  const add = (g) => P.push(finalize(g, C));
  add(ball([0, 0.35, 0], 0.22, 1.1, 0.55, 2.0, 12));
  add(ball([0, 0.32, 0.55], 0.13, 1.0, 0.7, 1.2, 10));
  for (const s of [-1, 1]) {
    add(limb([s * 0.05, 0.3, 0.66], [s * 0.12, 0.18, 0.86], 0.02, 0.004, 5)); // mandibles
    for (let k = 0; k < 4; k++) {
      const z = 0.3 - k * 0.22;
      const knee = [s * (0.55 + k * 0.05), 0.75, z + (1.5 - k) * 0.12];
      const foot = [s * (0.95 + k * 0.08), 0.0, z + (1.5 - k) * 0.25];
      add(limb([s * 0.15, 0.35, z], knee, 0.035, 0.025, 6));
      add(limb(knee, foot, 0.025, 0.006, 6));
    }
  }
  return merge(P);
}

// A hooded keeper. pose: 'kneel' (echoes at prayer), 'sit' (dead, slumped against
// something), 'stand'. Holds a small lantern unless `lantern` is false. Faces +Z.
export function buildKeeper(pose = 'kneel', { lantern = true, tone = 0 } = {}) {
  const o = tone > 0 ? { tone, gloss: 0.15 } : C;
  const P = [];
  const add = (g) => P.push(finalize(g, o));
  const y0 = pose === 'stand' ? 0 : pose === 'kneel' ? -0.45 : -0.75;
  const lean = pose === 'sit' ? -0.35 : pose === 'kneel' ? 0.15 : 0;
  // robe: open cone, hood, head
  const robe = new THREE.CylinderGeometry(0.17, pose === 'sit' ? 0.45 : 0.38, pose === 'sit' ? 0.75 : 1.2, 12, 3, false);
  robe.applyMatrix4(mat([0, y0 + (pose === 'sit' ? 0.95 : 0.95), 0], [lean, 0, 0]));
  add(robe);
  const headY = y0 + (pose === 'sit' ? 1.45 : 1.68);
  const hz = Math.sin(lean) * -0.5 + (pose === 'sit' ? 0.12 : 0.05);
  add(ball([0, headY - 0.02, hz - 0.03], 0.15, 1, 1.15, 1.1, 10)); // hood
  add(ball([0, headY - 0.04, hz + 0.05], 0.1, 0.9, 1.1, 0.9, 8));  // face in the hood
  if (pose === 'sit') {
    for (const s of [-1, 1]) {
      add(limb([s * 0.15, y0 + 0.62, 0.05], [s * 0.2, y0 + 0.6, 0.55], 0.075, 0.065, 8)); // thighs
      add(limb([s * 0.2, y0 + 0.6, 0.55], [s * 0.22, y0 + 0.62 - 0.4, 0.62], 0.06, 0.05, 8));
      add(limb([s * 0.2, y0 + 1.25, 0.05], [s * 0.3, y0 + 0.8, 0.35], 0.05, 0.04, 8)); // arms in the lap
    }
  } else {
    for (const s of [-1, 1]) {
      add(limb([s * 0.2, y0 + 1.42, 0.02], [s * 0.18, y0 + 1.1, 0.28], 0.05, 0.04, 8));
      add(limb([s * 0.18, y0 + 1.1, 0.28], [s * 0.06, y0 + 1.15, 0.38], 0.04, 0.035, 8)); // hands together
    }
  }
  if (lantern) {
    const ly = pose === 'sit' ? y0 + 0.45 : y0 + 1.0;
    const lz = pose === 'sit' ? 0.75 : 0.42;
    add(new THREE.BoxGeometry(0.11, 0.15, 0.11).applyMatrix4(mat([0, ly, lz])));
    add(new THREE.ConeGeometry(0.08, 0.06, 4).applyMatrix4(mat([0, ly + 0.1, lz], [0, Math.PI / 4, 0])));
    add(limb([0, ly + 0.13, lz], [0.04, y0 + 1.12, 0.38], 0.006, 0.006, 3));
  }
  return merge(P);
}
