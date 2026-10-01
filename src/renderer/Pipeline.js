// The render pipeline. Order per frame:
//   1 ShadowPass      lantern cube distance map (WORLD + CAGE layers)
//   2 ReflectionPass  mirrored camera -> water reflection texture (reduced res)
//   3 Main MRT pass   HDR colour + view normal/light term + depth (all layers)
//   4 FogPass         raymarched volumetric light (reduced res)
//   5 BloomPass       flame-only bloom chain (half res and below)
//   6 CompositePass   outlines, fog, bloom, paper/grain/vignette, palette -> screen
import * as THREE from 'three';
import './ShaderLib.js';
import { settings, qualityPreset } from '../core/Settings.js';
import { shared, syncSharedUniforms } from './SharedUniforms.js';
import { createNoise3D, createPaperTexture } from './ProceduralTextures.js';
import { LAYERS } from './Layers.js';
import { ShadowPass } from './passes/ShadowPass.js';
import { ReflectionPass } from './passes/ReflectionPass.js';
import { FogPass } from './passes/FogPass.js';
import { BloomPass } from './passes/BloomPass.js';
import { CompositePass } from './passes/CompositePass.js';

export class Pipeline {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = true;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.NoToneMapping;

    shared.uNoise3D.value = createNoise3D(64);
    this.paper = createPaperTexture(512);

    const q = qualityPreset();
    this.shadow = new ShadowPass(q.shadowSize);
    this.reflection = new ReflectionPass(0);
    this.fog = new FogPass();
    this.bloom = new BloomPass();
    this.composite = new CompositePass(this.paper);

    const depthTexture = new THREE.DepthTexture(4, 4);
    depthTexture.type = THREE.UnsignedIntType;
    this.mainRT = new THREE.WebGLRenderTarget(4, 4, {
      count: 2,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
    });
    this.mainRT.textures[1].minFilter = THREE.NearestFilter;
    this.mainRT.textures[1].magFilter = THREE.NearestFilter;

    this.debugView = 0;
    this.frame = 0;
    this.cssSize = [1, 1];
    this.bufferSize = [1, 1];
    this.pixelRatio = 1;
  }

  get quality() {
    return qualityPreset();
  }

  setQuality(name) {
    settings.quality = name;
    this.shadow.setSize(this.quality.shadowSize);
    this.resize(this.cssSize[0], this.cssSize[1]);
  }

  resize(w, h) {
    this.cssSize = [w, h];
    const q = this.quality;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatioCap);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const bw = size.x, bh = size.y;
    this.bufferSize = [bw, bh];
    this.mainRT.setSize(bw, bh);
    this.reflection.setSize(bw * q.reflectionScale, bh * q.reflectionScale);
    this.fog.setSize(bw * q.fogScale, bh * q.fogScale);
    this.bloom.setSize(bw, bh);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    const q = this.quality;
    r.info.reset();
    this.frame++;

    syncSharedUniforms();
    shared.uTime.value = time;
    shared.uShadowTaps.value = q.shadowTaps;
    shared.uPxScale.value = this.bufferSize[1] / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // 1. shadows
    this.shadow.render(r, scene, shared.uLightPos.value, settings.light.cageShadows, this.shadowFar || 40);

    // 2. reflection
    this.reflection.render(r, scene, camera);

    // 3. main MRT pass
    camera.layers.disableAll();
    camera.layers.enable(LAYERS.WORLD);
    camera.layers.enable(LAYERS.VIEWMODEL);
    camera.layers.enable(LAYERS.WATER);
    camera.layers.enable(LAYERS.FX);
    camera.layers.enable(LAYERS.HELDFX);
    r.setRenderTarget(this.mainRT);
    r.setClearColor(0x000000, 0);
    r.render(scene, camera);

    // 4. volumetric light
    this.fog.render(r, this.mainRT.depthTexture, camera, settings.fog, q.fogSteps, this.frame);

    // 5. bloom
    this.bloom.render(r, this.mainRT.textures[0], q.bloomLevels, settings.post.bloomThreshold, settings.post.bloomRadius);

    // 6. composite to screen
    this.composite.render(r, {
      color: this.mainRT.textures[0],
      normal: this.mainRT.textures[1],
      depth: this.mainRT.depthTexture,
      fog: this.fog.rt.texture,
      bloom: this.bloom.output,
      width: this.bufferSize[0],
      height: this.bufferSize[1],
    }, camera, settings, this.pixelRatio, this.debugView);

  }
}
