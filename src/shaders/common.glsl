// lk_common — shared helpers. Included by every Lanternkeeper shader.
#ifndef LK_COMMON
#define LK_COMMON

#define LK_PI 3.14159265359

float lk_sat(float x) { return clamp(x, 0.0, 1.0); }
vec3  lk_sat(vec3 x)  { return clamp(x, 0.0, 1.0); }

float lk_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

mat2 lk_rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// Integer-free hash (stable on mobile/ANGLE).
float lk_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float lk_hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// 2D value noise, smooth, range 0..1.
float lk_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = lk_hash12(i);
  float b = lk_hash12(i + vec2(1.0, 0.0));
  float c = lk_hash12(i + vec2(0.0, 1.0));
  float d = lk_hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Interleaved gradient noise (Jimenez) — good per-pixel dither.
float lk_ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

vec3 lk_linearToSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

#endif
