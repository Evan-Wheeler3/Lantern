// Textures generated at startup: no external assets in this prototype.
import * as THREE from 'three';
import { fbm3, valueNoise3, mulberry32 } from '../core/noise.js';

// 64^3 tileable noise volume. R/G = two independent fbm fields, B = ridged.
export function createNoise3D(size = 64) {
  const data = new Uint8Array(size * size * size * 4);
  const period = 8; // lattice cells per tile at the base octave
  const s = period / size;
  let i = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = fbm3(x * s, y * s, z * s, 3, 11, period);
        const b = fbm3(x * s + 3.7, y * s + 1.3, z * s + 5.1, 3, 97, period);
        const r = 1 - Math.abs(valueNoise3(x * s * 2, y * s * 2, z * s * 2, 41, period * 2) * 2 - 1);
        data[i++] = a * 255;
        data[i++] = b * 255;
        data[i++] = r * 255;
        data[i++] = 255;
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Paper: R = fibre/tooth luminance (around 0.5..1), G = blotchy ink density.
export function createPaperTexture(size = 512) {
  const data = new Uint8Array(size * size * 4);
  const rand = mulberry32(1234);
  const fib = new Float32Array(size * size);
  // Fibres: many short random strokes accumulated into a buffer (wrapping).
  for (let f = 0; f < 2600; f++) {
    let x = rand() * size, y = rand() * size;
    const ang = rand() * Math.PI;
    const len = 6 + rand() * 30;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const str = (rand() - 0.4) * 0.5;
    for (let t = 0; t < len; t++) {
      const xi = ((Math.floor(x) % size) + size) % size;
      const yi = ((Math.floor(y) % size) + size) % size;
      fib[yi * size + xi] += str;
      x += dx; y += dy;
    }
  }
  const p = 16; // tile period in noise cells
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * p, v = (y / size) * p;
      const tooth = fbm3(u * 4, v * 4, 0.5, 3, 7, p * 4);
      const cloud = fbm3(u * 0.5, v * 0.5, 2.5, 4, 3, p * 0.5);
      let r = 0.62 + tooth * 0.35 + cloud * 0.18 + fib[y * size + x] * 0.25;
      const g = fbm3(u * 1.25, v * 1.25, 7.5, 4, 19, p * 1.25) * 0.7 + rand() * 0.3;
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, (r - 0.15) * 255));
      data[i + 1] = g * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
