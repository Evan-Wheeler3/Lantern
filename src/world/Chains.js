// Hanging chains: one InstancedMesh for every link in the room, swung as slow
// pendulums each frame (cheap CPU matrix updates). One chain carries a gibbet cage.
import * as THREE from 'three';
import { finalize, merge, limb, mat } from './geo.js';
import { LAYERS } from '../renderer/Layers.js';

const SPACING = 0.118;
const IRON = { tone: 0.62, gloss: 0.8 };

function buildCage() {
  const P = [];
  const add = (g) => P.push(finalize(g, IRON));
  const r = 0.34, h = 1.15, bars = 9;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    add(limb([x * 0.25, 0, z * 0.25], [x, -0.3, z], 0.012, 0.012, 4));
    add(limb([x, -0.3, z], [x * 1.05, -h + 0.15, z * 1.05], 0.012, 0.012, 4));
    add(limb([x * 1.05, -h + 0.15, z * 1.05], [x * 0.3, -h, z * 0.3], 0.012, 0.012, 4));
  }
  for (const y of [-0.3, -0.75, -h + 0.15]) add(new THREE.TorusGeometry(r * (y < -1 ? 1.05 : 1), 0.016, 4, 24).applyMatrix4(mat([0, y, 0], [Math.PI / 2, 0, 0])));
  add(new THREE.TorusGeometry(0.06, 0.015, 4, 10));
  // a bent bar: the cage was forced open
  add(limb([r, -0.75, 0], [r + 0.25, -1.05, 0.1], 0.013, 0.013, 4));
  return merge(P);
}

export class Chains {
  constructor(anchors, material) {
    this.chains = anchors.map((a, i) => ({
      ...a,
      links: Math.max(4, Math.floor((a.y - a.bottom) / SPACING)),
      phase: i * 1.7,
      phase2: i * 0.9 + 0.4,
      w: Math.sqrt(9.81 / Math.max(a.y - a.bottom, 1)),
      amp: 0.012 + (i % 3) * 0.006,
    }));
    const count = this.chains.reduce((n, c) => n + c.links, 0);
    const link = new THREE.TorusGeometry(0.048, 0.012, 4, 8); // 64 tris: ~570 links x 8 passes
    link.scale(1, 1.45, 1);
    this.mesh = new THREE.InstancedMesh(finalize(link, IRON), material, count);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYERS.WORLD);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.cages = [];
    const cageGeo = buildCage();
    for (const c of this.chains) {
      if (!c.cage) continue;
      const m = new THREE.Mesh(cageGeo, material);
      m.layers.set(LAYERS.WORLD);
      m.frustumCulled = false;
      this.group.add(m);
      this.cages.push({ chain: c, mesh: m });
    }
    this._q = new THREE.Quaternion();
    this._qa = new THREE.Quaternion();
    this._twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3(1, 1, 1);
    this.update(0);
  }

  update(t) {
    let k = 0;
    for (const c of this.chains) {
      const ax = c.amp * Math.sin(t * c.w + c.phase);
      const az = c.amp * 0.7 * Math.sin(t * c.w * 1.17 + c.phase2);
      this._e.set(ax, 0, az);
      this._qa.setFromEuler(this._e);
      for (let i = 0; i < c.links; i++) {
        this._p.set(0, -(i + 0.5) * SPACING, 0).applyQuaternion(this._qa);
        this._p.x += c.x; this._p.y += c.y; this._p.z += c.z;
        this._q.copy(this._qa);
        if (i & 1) this._q.multiply(this._twist);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(k++, this._m);
      }
      c.endPos = c.endPos || new THREE.Vector3();
      c.endPos.set(0, -c.links * SPACING, 0).applyQuaternion(this._qa).add(this._p.set(c.x, c.y, c.z));
      c.endQuat = (c.endQuat || new THREE.Quaternion()).copy(this._qa);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const { chain, mesh } of this.cages) {
      mesh.position.copy(chain.endPos);
      mesh.quaternion.copy(chain.endQuat);
      mesh.rotateY(t * 0.05);
    }
  }
}
