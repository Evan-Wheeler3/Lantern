// Pass 4: raymarched volumetric lantern light at reduced resolution.
import * as THREE from 'three';
import { FullscreenPass } from './FullscreenPass.js';
import { SHADERS } from '../ShaderLib.js';
import { shared } from '../SharedUniforms.js';

export class FogPass {
  constructor() {
    this.pass = new FullscreenPass(SHADERS.fogFrag, {
      ...shared,
      tDepth: { value: null },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uNearFar: { value: new THREE.Vector2() },
      uSteps: { value: 24 },
      uFrame: { value: 0 },
      uFogA: { value: new THREE.Vector4() },
      uFogB: { value: new THREE.Vector2() },
    }, 'lk-fog');
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  render(renderer, depthTexture, camera, fog, steps, frame) {
    const u = this.pass.uniforms;
    u.tDepth.value = depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uNearFar.value.set(camera.near, camera.far);
    u.uSteps.value = steps;
    u.uFrame.value = frame % 64;
    u.uFogA.value.set(fog.density, fog.noiseScale, fog.noise, fog.heightFalloff);
    u.uFogB.value.set(fog.anisotropy, fog.extinction);
    this.pass.render(renderer, this.rt);
  }
}
