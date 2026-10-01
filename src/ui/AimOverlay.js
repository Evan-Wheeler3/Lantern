// The firebomb's arc guide, projected to the screen and drawn on a 2D canvas over
// the print (crisp, never bloomed, visible through walls like any aiming aid).
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class AimOverlay {
  constructor() {
    this.c = document.getElementById('aim');
    this.g = this.c.getContext('2d');
  }

  update(firebomb, camera) {
    const c = this.c, g = this.g;
    const on = firebomb.state === 'charging';
    if (!on) { if (this._was) g.clearRect(0, 0, c.width, c.height); this._was = false; return; }
    this._was = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    const P = firebomb.guidePos;
    const toScreen = (k) => {
      _v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).project(camera);
      if (_v.z > 1) return null;
      return [(_v.x * 0.5 + 0.5) * w, (-_v.y * 0.5 + 0.5) * h];
    };
    // dotted arc
    g.fillStyle = 'rgba(255,138,31,0.9)';
    for (let k = 0; k < firebomb.guideCount; k++) {
      const s = toScreen(k);
      if (!s) continue;
      g.beginPath(); g.arc(s[0], s[1], 2.2 * dpr, 0, Math.PI * 2); g.fill();
    }
    // landing ring: an ellipse on the ground, sized by the burst radius
    const last = P.length / 3 - 1;
    const centre = toScreen(last);
    if (!centre) return;
    const x = P[last * 3], y = P[last * 3 + 1], z = P[last * 3 + 2];
    g.strokeStyle = 'rgba(255,226,176,0.95)';
    g.lineWidth = 1.6 * dpr;
    g.setLineDash([6 * dpr, 4 * dpr]);
    g.beginPath();
    const r = firebomb.radius || 3;
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      _v.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r).project(camera);
      const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
      if (k) g.lineTo(sx, sy); else g.moveTo(sx, sy);
    }
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,226,176,0.95)';
    g.beginPath(); g.arc(centre[0], centre[1], 3.5 * dpr, 0, Math.PI * 2); g.fill();
  }
}
