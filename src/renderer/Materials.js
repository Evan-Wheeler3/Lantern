// Material factories. Every material shares the uniform objects in `shared`
// (spread, not cloned), adding only its own per-material uniforms.
import * as THREE from 'three';
import { SHADERS } from './ShaderLib.js';
import { shared } from './SharedUniforms.js';

export function createWorldMaterial({ objectHatch = false, hatchScale = 1 } = {}) {
  return new THREE.ShaderMaterial({
    name: objectHatch ? 'lk-viewmodel' : 'lk-world',
    uniforms: {
      ...shared,
      uObjectHatch: { value: objectHatch ? 1 : 0 },
      uHatchObjScale: { value: hatchScale },
      uWetHeight: { value: 1.1 },
    },
    vertexShader: SHADERS.worldVert,
    fragmentShader: SHADERS.worldFrag,
    side: THREE.DoubleSide,
  });
}

export function createCreatureMaterial() {
  return new THREE.ShaderMaterial({
    name: 'lk-creature',
    uniforms: {
      ...shared,
      uObjectHatch: { value: 0 },
      uHatchObjScale: { value: 1 },
      uRim: { value: new THREE.Vector3(3, 0.45, 0.2) },
    },
    vertexShader: SHADERS.worldVert,
    fragmentShader: SHADERS.creatureFrag,
    side: THREE.DoubleSide,
  });
}

export function createWaterMaterial() {
  const ripples = [];
  for (let i = 0; i < 16; i++) ripples.push(new THREE.Vector4(0, 0, -100, 0));
  return new THREE.ShaderMaterial({
    name: 'lk-water',
    uniforms: {
      ...shared,
      uReflection: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
      uRipples: { value: ripples },
      uWaterA: { value: new THREE.Vector4() },
      uWaterB: { value: new THREE.Vector4() },
      uWaterC: { value: new THREE.Vector4() },
    },
    vertexShader: SHADERS.waterVert,
    fragmentShader: SHADERS.waterFrag,
  });
}

export function createFlameMaterial() {
  return new THREE.ShaderMaterial({
    name: 'lk-flame',
    uniforms: {
      uTime: shared.uTime,
      uEmber: shared.uEmber,
      uCream: shared.uCream,
      uFlicker: { value: 1 },
      uFlameGain: { value: 1 },
    },
    vertexShader: SHADERS.flameVert,
    fragmentShader: SHADERS.flameFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createEmberMaterial() {
  return new THREE.ShaderMaterial({
    name: 'lk-embers',
    uniforms: {
      ...shared,
      uBox: { value: new THREE.Vector3(13, 8, 13) },
      uSize: { value: 1 },
    },
    vertexShader: SHADERS.embersVert,
    fragmentShader: SHADERS.embersFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createDripMaterial() {
  return new THREE.ShaderMaterial({
    name: 'lk-drips',
    uniforms: {
      ...shared,
    },
    vertexShader: SHADERS.dripsVert,
    fragmentShader: SHADERS.dripsFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createShadowDepthMaterial() {
  return new THREE.ShaderMaterial({
    name: 'lk-shadow-depth',
    uniforms: { uLightPos: shared.uLightPos },
    vertexShader: SHADERS.shadowVert,
    fragmentShader: SHADERS.shadowFrag,
    side: THREE.DoubleSide,
  });
}
