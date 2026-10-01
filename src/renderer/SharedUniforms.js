// One set of uniform objects referenced by EVERY material. Updating a value here
// updates all shaders at once (three keeps the object reference).
import * as THREE from 'three';
import { settings } from '../core/Settings.js';

const v3 = () => ({ value: new THREE.Vector3() });
const v4 = () => ({ value: new THREE.Vector4() });

export const shared = {
  uTime: { value: 0 },
  // lantern light (written by the Lantern system)
  uLightPos: v3(),
  uLightColor: { value: new THREE.Vector3(1, 0.5, 0.2) },
  uLightIntensity: { value: 1 },
  uLightRange: { value: 10 },
  uSpotDir: { value: new THREE.Vector3(0, 0, -1) },
  uFocus: { value: 0 },
  uSpot: v3(),
  uShadowMap: { value: null },
  uShadow: { value: new THREE.Vector3(0.04, 0.03, 0.006) },
  uShadowTaps: { value: 5 },
  // palette (linear)
  uInk: v3(), uOil: v3(), uEmber: v3(), uCream: v3(),
  // ink model
  uBand: v4(), uBand2: v4(),
  uHatchA: v4(), uHatchB: v4(), uHatchC: { value: new THREE.Vector2() },
  uNoise3D: { value: null },
  // projection scale for point sprites: bufferHeight / (2 tan(fov/2))
  uPxScale: { value: 800 },
};

const tmpColor = new THREE.Color();
export const paletteLinear = {
  ink: new THREE.Vector3(), oil: new THREE.Vector3(), ember: new THREE.Vector3(), cream: new THREE.Vector3(),
};

function hexToLinear(hex, out) {
  tmpColor.set(hex); // ColorManagement converts sRGB hex -> linear working space
  return out.set(tmpColor.r, tmpColor.g, tmpColor.b);
}

const DEG = Math.PI / 180;

// Push the style settings into the shared uniforms. Cheap; runs every frame so
// the debug panel is always live.
export function syncSharedUniforms() {
  const s = settings;
  hexToLinear(s.palette.ink, paletteLinear.ink);
  hexToLinear(s.palette.oil, paletteLinear.oil);
  hexToLinear(s.palette.ember, paletteLinear.ember);
  hexToLinear(s.palette.cream, paletteLinear.cream);
  shared.uInk.value.copy(paletteLinear.ink);
  shared.uOil.value.copy(paletteLinear.oil);
  shared.uEmber.value.copy(paletteLinear.ember);
  shared.uCream.value.copy(paletteLinear.cream);

  const b = s.bands;
  shared.uBand.value.set(b.low, Math.max(b.high, b.low + 0.01), Math.max(b.hot, b.high + 0.01), b.softness);
  shared.uBand2.value.set(b.noise, b.midTone, b.specThreshold, b.specPower);

  const h = s.hatch;
  shared.uHatchA.value.set(h.density, h.thickness, h.wobble, h.angle * DEG);
  shared.uHatchB.value.set(h.angleVar * DEG, h.crossStart, h.lodDistance, h.litStrokes);
  shared.uHatchC.value.set(h.enabled ? 1 : 0, h.breakup);

  const l = s.light;
  const outer = Math.cos(l.focusAngle * DEG);
  const inner = Math.cos(l.focusAngle * 0.55 * DEG);
  shared.uSpot.value.set(outer, inner, l.focusLeak);
  shared.uShadow.value.x = l.shadowBias;
}
