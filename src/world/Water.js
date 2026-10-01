// The flood: one plane at y = 0 spanning the nave. Rendered only in the main pass.
import * as THREE from 'three';
import { createWaterMaterial } from '../renderer/Materials.js';
import { LAYERS } from '../renderer/Layers.js';
import { shared } from '../renderer/SharedUniforms.js';
import { settings, qualityPreset } from '../core/Settings.js';
import { Ripples } from './Ripples.js';

export class Water {
  constructor({ minX, maxX, minZ, maxZ, level = 0 }) {
    this.material = createWaterMaterial();
    const g = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.position.set((minX + maxX) / 2, level, (minZ + maxZ) / 2);
    this.mesh.layers.set(LAYERS.WATER);
    this.ripples = new Ripples(this.material.uniforms.uRipples.value, shared.uTime);
  }

  bindReflection(reflectionPass) {
    this.material.uniforms.uReflection.value = reflectionPass.rt.texture;
    this.material.uniforms.uReflMatrix.value = reflectionPass.textureMatrix; // same object, auto-updated
  }

  update() {
    const w = settings.water;
    const u = this.material.uniforms;
    u.uWaterA.value.set(w.reflectivity, w.distortion, w.stretch, w.ripple);
    u.uWaterB.value.set(w.sheen, w.sheenScale, w.sheenSpeed, w.glint);
    u.uWaterC.value.set(w.bands, w.hatch, qualityPreset().reflectionTaps, 0);
  }
}
