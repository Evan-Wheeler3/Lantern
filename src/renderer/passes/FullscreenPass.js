import * as THREE from 'three';
import { SHADERS } from '../ShaderLib.js';

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// A single big triangle with a ShaderMaterial; the building block for every post pass.
export class FullscreenPass {
  constructor(fragmentShader, uniforms, name) {
    this.material = new THREE.ShaderMaterial({
      name,
      uniforms,
      vertexShader: SHADERS.fullscreenVert,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(tri, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }

  get uniforms() {
    return this.material.uniforms;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, orthoCam);
  }

  dispose() {
    this.material.dispose();
  }
}
