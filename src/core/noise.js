// Deterministic CPU noise used for geometry displacement and texture generation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Value noise in [0,1]. `period` (optional) makes it tile on integer lattice.
export function valueNoise3(x, y, z, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const wrap = (i) => (period ? ((i % period) + period) % period : i);
  const X0 = wrap(xi), X1 = wrap(xi + 1), Y0 = wrap(yi), Y1 = wrap(yi + 1), Z0 = wrap(zi), Z1 = wrap(zi + 1);
  return lerp(
    lerp(lerp(hash3(X0, Y0, Z0, seed), hash3(X1, Y0, Z0, seed), u), lerp(hash3(X0, Y1, Z0, seed), hash3(X1, Y1, Z0, seed), u), v),
    lerp(lerp(hash3(X0, Y0, Z1, seed), hash3(X1, Y0, Z1, seed), u), lerp(hash3(X0, Y1, Z1, seed), hash3(X1, Y1, Z1, seed), u), v),
    w,
  );
}

export function fbm3(x, y, z, octaves = 4, seed = 0, period = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise3(x * f, y * f, z * f, seed + o * 17, period ? period * f : 0) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
