// Pass 5: flame-only bloom. Bright pass (high threshold) -> dual-Kawase down/up chain.
import * as THREE from 'three';
import { FullscreenPass } from './FullscreenPass.js';
import { SHADERS } from '../ShaderLib.js';

const MAX_LEVELS = 6;

function makeRT() {
  return new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
}

export class BloomPass {
  constructor() {
    this.bright = new FullscreenPass(SHADERS.bloomBrightFrag, {
      tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 2 },
    }, 'lk-bloom-bright');
    this.down = new FullscreenPass(SHADERS.bloomDownFrag, {
      tInput: { value: null }, uTexel: { value: new THREE.Vector2() },
    }, 'lk-bloom-down');
    this.up = new FullscreenPass(SHADERS.bloomUpFrag, {
      tInput: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 },
    }, 'lk-bloom-up');
    this.downRTs = [];
    this.upRTs = [];
    for (let i = 0; i < MAX_LEVELS; i++) {
      this.downRTs.push(makeRT());
      this.upRTs.push(makeRT());
    }
    this.levels = 5;
    this.output = this.downRTs[0].texture;
  }

  setSize(w, h) {
    // level 0 = half resolution
    let lw = Math.max(1, Math.round(w / 2)), lh = Math.max(1, Math.round(h / 2));
    for (let i = 0; i < MAX_LEVELS; i++) {
      this.downRTs[i].setSize(lw, lh);
      this.upRTs[i].setSize(lw, lh);
      lw = Math.max(1, Math.round(lw / 2));
      lh = Math.max(1, Math.round(lh / 2));
    }
  }

  render(renderer, inputTexture, levels, threshold, radius) {
    this.levels = Math.min(Math.max(levels, 1), MAX_LEVELS);
    const b = this.bright.uniforms;
    b.tInput.value = inputTexture;
    b.uTexel.value.set(1 / inputTexture.image.width, 1 / inputTexture.image.height);
    b.uThreshold.value = threshold;
    this.bright.render(renderer, this.downRTs[0]);

    const d = this.down.uniforms;
    for (let i = 1; i < this.levels; i++) {
      const src = this.downRTs[i - 1];
      d.tInput.value = src.texture;
      d.uTexel.value.set(1 / src.width, 1 / src.height);
      this.down.render(renderer, this.downRTs[i]);
    }

    const u = this.up.uniforms;
    u.uRadius.value = radius;
    let src = this.downRTs[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      u.tInput.value = src.texture;
      u.tBase.value = this.downRTs[i].texture;
      u.uTexel.value.set(1 / src.width, 1 / src.height);
      this.up.render(renderer, this.upRTs[i]);
      src = this.upRTs[i];
    }
    this.output = src.texture;
  }
}
