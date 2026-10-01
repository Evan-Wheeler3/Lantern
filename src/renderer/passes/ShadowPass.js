// Pass 1: omnidirectional lantern shadow. Renders radial distance from the flame
// into a half-float cube map with an override material.
import * as THREE from 'three';
import { LAYERS } from '../Layers.js';
import { createShadowDepthMaterial } from '../Materials.js';
import { shared } from '../SharedUniforms.js';

const FAR_CLEAR = new THREE.Color().setRGB(1000, 0, 0, THREE.LinearSRGBColorSpace);

export class ShadowPass {
  constructor(size) {
    this.material = createShadowDepthMaterial();
    this.setSize(size);
  }

  setSize(size) {
    if (this.rt && this.size === size) return;
    this.rt?.dispose();
    this.size = size;
    this.rt = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    this.camera = new THREE.CubeCamera(0.015, 40, this.rt);
    shared.uShadowMap.value = this.rt.texture;
  }

  render(renderer, scene, lightPos, cageShadows, far = 40) {
    for (const cam of this.camera.children) {
      // nothing beyond the light's range needs a shadow: cull it
      if (Math.abs(cam.far - far) > 0.25) { cam.far = far; cam.updateProjectionMatrix(); }
      cam.layers.disableAll();
      cam.layers.enable(LAYERS.WORLD);
      if (cageShadows) cam.layers.enable(LAYERS.CAGE);
    }
    this.camera.position.copy(lightPos);
    this.camera.updateMatrixWorld(true);
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.material;
    renderer.setClearColor(FAR_CLEAR, 1);
    this.camera.update(renderer, scene);
    scene.overrideMaterial = prevOverride;
  }
}
