// Pass 6: outlines + fog + bloom + print grade + palette mapping -> screen.
import * as THREE from 'three';
import { FullscreenPass } from './FullscreenPass.js';
import { SHADERS } from '../ShaderLib.js';
import { shared, paletteLinear } from '../SharedUniforms.js';

const luma = (v) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;

export class CompositePass {
  constructor(paperTexture) {
    this.pass = new FullscreenPass(SHADERS.compositeFrag, {
      tColor: { value: null },
      tNormal: { value: null },
      tDepth: { value: null },
      tFog: { value: null },
      tBloom: { value: null },
      tPaper: { value: paperTexture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNearFar: { value: new THREE.Vector2() },
      uTime: shared.uTime,
      uInk: shared.uInk,
      uOil: shared.uOil,
      uEmber: shared.uEmber,
      uCream: shared.uCream,
      uLightColor: shared.uLightColor,
      uRampStops: { value: new THREE.Vector4() },
      uOutA: { value: new THREE.Vector4() },
      uOutB: { value: new THREE.Vector4() },
      uPostA: { value: new THREE.Vector4() },
      uPostB: { value: new THREE.Vector4() },
      uFogIntensity: { value: 1 },
      uDebugView: { value: 0 },
      uHurt: { value: 0 },
      uFade: { value: 0 },
      uFadeTo: { value: 0 },
    }, 'lk-composite');
  }

  render(renderer, inputs, camera, s, pixelRatio, debugView) {
    const u = this.pass.uniforms;
    u.tColor.value = inputs.color;
    u.tNormal.value = inputs.normal;
    u.tDepth.value = inputs.depth;
    u.tFog.value = inputs.fog;
    u.tBloom.value = inputs.bloom;
    u.uResolution.value.set(inputs.width, inputs.height);
    u.uNearFar.value.set(camera.near, camera.far);

    // Ramp stops = the palette's own luminances, forced monotonic.
    const s0 = luma(paletteLinear.ink);
    const s1 = Math.max(luma(paletteLinear.oil), s0 + 1e-4);
    const s2 = Math.max(luma(paletteLinear.ember), s1 + 1e-4);
    const s3 = Math.max(luma(paletteLinear.cream), s2 + 1e-4);
    u.uRampStops.value.set(s0, s1, s2, s3);

    const o = s.outline;
    // Outline widths are authored in CSS pixels; scale to the render buffer.
    u.uOutA.value.set(o.width * pixelRatio, o.depthThreshold, o.normalThreshold, o.wobble * pixelRatio);
    u.uOutB.value.set(o.wobbleFreq, o.boilFps, o.darkVisibility, o.darkGlow);
    const p = s.post;
    u.uPostA.value.set(p.exposure, p.contrast, p.bloom, p.grain);
    u.uPostB.value.set(p.paper, p.vignette, p.paletteStrength, p.posterize);
    u.uFogIntensity.value = s.fog.intensity;
    u.uDebugView.value = debugView;

    this.pass.render(renderer, null);
  }
}
