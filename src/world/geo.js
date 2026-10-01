// Geometry helpers for the procedural cathedral. Everything is converted to a
// common attribute layout (position, normal, aTone, aGloss) so it can be merged
// into as few draw calls as possible.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3 } from '../core/noise.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export function mat(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
}

// Displace positions with a smooth vector noise field (crack-free: identical
// positions always move identically, regardless of normals).
export function displace(geo, amount, scale = 1.2, seed = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const dx = fbm3(x * scale, y * scale, z * scale, 3, seed + 1) - 0.5;
    const dy = fbm3(x * scale + 7.1, y * scale, z * scale, 3, seed + 2) - 0.5;
    const dz = fbm3(x * scale, y * scale + 3.3, z * scale, 3, seed + 3) - 0.5;
    p.setXYZ(i, x + dx * amount * 2, y + dy * amount * 2, z + dz * amount * 2);
  }
  p.needsUpdate = true;
  return geo;
}

// Bring a geometry into the shared layout.
//  tone  : albedo 0..1      gloss: wetness/metal 0..1
//  flat  : faceted normals (chiselled look)
//  matrix: placement      disp/dispScale: hand-hewn displacement (world space)
export function finalize(geo, { tone = 0.75, gloss = 0.15, flat = false, matrix = null, disp = 0, dispScale = 1.2, seed = 0 } = {}) {
  let g = geo;
  if (matrix) g.applyMatrix4(matrix);
  if (disp > 0) displace(g, disp, dispScale, seed);
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (flat || disp > 0 || !g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(new Float32Array(n).fill(tone), 1));
  g.setAttribute('aGloss', new THREE.Float32BufferAttribute(new Float32Array(n).fill(gloss), 1));
  g.morphAttributes = {};
  return g;
}

// Merge into spatial chunks (binned along z, the long axis of the nave) so every
// pass — especially the six cube-shadow faces — can frustum-cull most of the room.
export function mergeChunked(list, binSize = 7) {
  const bins = new Map();
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const g of list) {
    box.setFromBufferAttribute(g.attributes.position);
    box.getCenter(c);
    const size = box.getSize(new THREE.Vector3());
    // very long pieces (vault, walls, floor) go in their own bin
    const key = Math.max(size.x, size.z) > binSize * 2 ? 'big' : Math.floor(c.z / binSize) * 10 + (c.x < -2 ? 0 : c.x > 2 ? 2 : 1);
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(g);
  }
  return [...bins.values()].map((l) => merge(l));
}

export function merge(list) {
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('mergeGeometries failed (attribute mismatch)');
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// Cylinder from a to b (radii r0 at a, r1 at b).
export function limb(a, b, r0, r1, radial = 8, open = false) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = _v.subVectors(B, A);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, Math.max(1, Math.round(len * 3)), open);
  _q.setFromUnitVectors(UP, dir.normalize());
  _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function ball(c, r, sx = 1, sy = 1, sz = 1, seg = 10) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
  g.applyMatrix4(mat(c, [0, 0, 0], [sx, sy, sz]));
  return g;
}

// ---------------------------------------------------------------------------
// Pointed (gothic) arches. `f` = radius / span (0.5 = round, 1 = equilateral).
export function pointedArch(span, f) {
  const R = f * span;
  const cxl = -span / 2 + R;
  const cxr = span / 2 - R;
  return {
    R, cxl, cxr,
    // point on a concentric curve offset by `off` (outward), t in [0,1]
    at(t, off = 0) {
      const r = R + off;
      const ta = Math.acos(Math.min(1, Math.max(-1, -cxl / r)));
      if (t <= 0.5) {
        const a = Math.PI + (ta - Math.PI) * (t / 0.5);
        return [cxl + r * Math.cos(a), r * Math.sin(a)];
      }
      const a = (Math.PI - ta) * (1 - (t - 0.5) / 0.5);
      return [cxr + r * Math.cos(a), r * Math.sin(a)];
    },
    rise(off = 0) {
      return this.at(0.5, off)[1];
    },
  };
}

// Arch band (voussoirs) as a 2D shape in XY, springing at y = 0.
// tEnd < 1 gives a broken arch with a jagged fracture.
export function archBandShape(span, f, thickness, tEnd = 1, rand = Math.random, seg = 28) {
  const a = pointedArch(span, f);
  const pts = [];
  const n = Math.max(2, Math.round(seg * tEnd));
  for (let i = 0; i <= n; i++) pts.push(a.at((i / n) * tEnd, thickness));
  if (tEnd < 1) {
    const [ox, oy] = a.at(tEnd, thickness);
    const [ix, iy] = a.at(Math.max(0, tEnd - 0.05), 0);
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      pts.push([ox + (ix - ox) * t + (rand() - 0.5) * thickness * 0.8, oy + (iy - oy) * t + (rand() - 0.5) * thickness * 0.8]);
    }
  }
  const tIn = tEnd < 1 ? Math.max(0, tEnd - 0.05) : 1;
  const m = Math.max(2, Math.round(seg * tIn));
  for (let i = m; i >= 0; i--) pts.push(a.at((i / m) * tIn, 0));
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

// Wall panel of width `w` and height `h` whose bottom edge is cut by an arch
// (the spandrel above an arcade). `jagged` lowers and breaks the top edge.
export function spandrelShape(w, h, span, f, thickness, jagged = 0, rand = Math.random) {
  const a = pointedArch(span, f);
  const pts = [[-w / 2, 0]];
  const seg = 28;
  for (let i = 0; i <= seg; i++) pts.push(a.at(i / seg, thickness));
  pts.push([w / 2, 0]);
  if (jagged > 0) {
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const x = w / 2 - (w * i) / steps;
      const y = h - jagged * (0.3 + 0.7 * rand()) - (i > 2 && i < steps - 2 ? jagged * 0.6 : 0);
      pts.push([x, Math.max(y, a.rise(thickness) + 0.35)]);
    }
  } else {
    pts.push([w / 2, h], [-w / 2, h]);
  }
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

// Closed pointed-arch outline (for holes / recesses), bottom at y0.
export function archHolePath(cx, y0, width, springH, f, seg = 20) {
  const a = pointedArch(width, f);
  const pts = [[cx - width / 2, y0]];
  for (let i = 0; i <= seg; i++) {
    const [x, y] = a.at(i / seg, 0);
    pts.push([cx + x, y0 + springH + y]);
  }
  pts.push([cx + width / 2, y0]);
  return new THREE.Path(pts.map(([x, y]) => new THREE.Vector2(x, y)).reverse());
}

export function extrude(shape, depth, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Pointed barrel vault surface spanning x in [-span/2, span/2], from z0 to z1.
export function vaultGeometry(span, f, z0, z1, segX = 36, segZ = 24) {
  const a = pointedArch(span, f);
  const pos = [];
  const idx = [];
  for (let j = 0; j <= segZ; j++) {
    const z = z0 + ((z1 - z0) * j) / segZ;
    for (let i = 0; i <= segX; i++) {
      const [x, y] = a.at(i / segX, 0);
      pos.push(x, y, z);
    }
  }
  const row = segX + 1;
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const p = j * row + i;
      idx.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
