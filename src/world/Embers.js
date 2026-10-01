// Floating embers: fully GPU-driven (stateless) — see embers.vert.glsl.
import * as THREE from 'three';
import { createEmberMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { settings, qualityPreset } from '../core/Settings.js';
import { mulberry32 } from '../core/noise.js';

const MAX = 600;

export class Embers {
  constructor() {
    const rand = mulberry32(5);
    const seeds = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX * 4; i++) seeds[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.material = createEmberMaterial();
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.layers.set(LAYERS.FX);
  }

  update() {
    const count = Math.round(qualityPreset().emberCount * settings.particles.embers);
    this.points.geometry.setDrawRange(0, Math.min(MAX, count));
    this.material.uniforms.uSize.value = settings.particles.emberSize;
  }
}
