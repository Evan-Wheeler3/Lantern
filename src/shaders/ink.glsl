// lk_ink — "Ink and Ember" surface model.
// Light intensity I is cut into hard bands:  ink | mid (hatched) | ember | cream.
// Hatching is procedural, WORLD-anchored (triplanar, hard plane select) and uses a
// distance LOD (density halves every `lodDistance` doubling) so it neither swims
// nor turns to mush in the distance.
#ifndef LK_INK
#define LK_INK

uniform vec3 uInk;
uniform vec3 uOil;
uniform vec3 uEmber;
uniform vec3 uCream;
uniform vec4 uBand;    // low, high, hot, softness
uniform vec4 uBand2;   // noise, midTone, specThreshold, specPower
uniform vec4 uHatchA;  // density (lines/m), thickness, wobble, angle (rad)
uniform vec4 uHatchB;  // angleVar (rad), crossStart, lodDistance, litStrokes
uniform vec2 uHatchC;  // enabled, breakup
uniform sampler3D uNoise3D;

struct LkInk {
  vec3 color;
  float light; // 0..1 band-ish light term, written to the G-buffer for outlines
};

vec2 lk_planeUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > a.x && a.y > a.z) return p.xz;
  if (a.x > a.z) return p.zy;
  return p.xy;
}

// One family of parallel strokes. Returns ink coverage 0..1.
//  dens   : lines per metre at this LOD level
//  halfW  : half line width, in periods
//  lvl    : 2^level, keeps per-stroke randomness identical across LOD levels
//  phase  : offset in periods (0.5 = the "in-between" strokes)
float lk_strokes(vec2 uv, float ang, float dens, float halfW, float fwUV, float lvl, float phase) {
  if (halfW <= 0.002) return 0.0; // no derivatives below this point
  vec2 r = lk_rot(ang) * uv;
  float u = r.x * dens + phase;
  float id = floor(u + 0.5) * lvl + phase * 13.0;
  float along = r.y * uHatchA.x; // along-stroke coordinate in base periods
  // Hand wobble: low-frequency lateral drift, unique per stroke.
  float wob = (lk_vnoise(vec2(along * 0.11, id * 1.37)) - 0.5) * uHatchA.z * 2.0;
  u += wob / lvl;
  float dd = abs(fract(u + 0.5) - 0.5);
  // Pressure: stroke width swells and thins along its length.
  float w = halfW * (0.5 + lk_vnoise(vec2(along * 0.33 + 3.0, id * 3.11)));
  // Breakup: the gouge skips.
  float b = uHatchC.y * 0.7;
  float gap = smoothstep(b - 0.06, b + 0.06, lk_vnoise(vec2(along * 0.17 + 9.0, id * 2.31)));
  float fw = max(fwUV * dens, 1e-4);
  float line = 1.0 - smoothstep(w - fw, w + fw, dd);
  // Sub-pixel strokes: fade to their average coverage instead of aliasing.
  line = mix(line, min(2.0 * w, 1.0), smoothstep(0.28, 0.6, fw));
  return line * gap;
}

float lk_hatchLevel(vec2 uv, float k, float level, float fwUV) {
  float s = exp2(level);
  float dens = uHatchA.x / s;
  float hw = uHatchA.y * 0.5;
  float a = uHatchA.w;
  float av = uHatchB.x;
  float cs = uHatchB.y;
  float c = 0.0;
  // Primary strokes: always present in the mid band, thicken with darkness.
  c = max(c, lk_strokes(uv, a, dens, hw * (0.3 + 0.7 * k), fwUV, s, 0.0));
  // In-between strokes: density doubles as light falls off (slightly rotated).
  c = max(c, lk_strokes(uv, a + av, dens, hw * smoothstep(0.28, 0.7, k), fwUV, s, 0.5));
  // Cross layer for deeper shadow.
  c = max(c, lk_strokes(uv, a + 1.22 + av * 0.5, dens, hw * 0.9 * smoothstep(cs, cs + 0.3, k), fwUV, s, 0.25));
  c = max(c, lk_strokes(uv, a + 1.22 - av, dens, hw * 0.9 * smoothstep(min(cs + 0.32, 0.92), 1.0, k), fwUV, s, 0.75));
  return c;
}

float lk_hatch(vec2 uv, float k, float viewDist, float fwUV) {
  float lvl = max(0.0, log2(max(viewDist, 1e-3) / uHatchB.z));
  float l0 = floor(lvl);
  float f = lvl - l0;
  float c0 = lk_hatchLevel(uv, k, l0, fwUV);
  float c1 = f > 0.02 ? lk_hatchLevel(uv, k, l0 + 1.0, fwUV) : c0;
  return mix(c0, c1, f);
}

// Chisel gouges that texture the lit band: clustered patches of short cuts
// following the hatch direction (a block cutter's tool marks, not wood grain).
float lk_gouges(vec2 uv, float viewDist, float fwUV) {
  float lvl = max(0.0, log2(max(viewDist, 1e-3) / (uHatchB.z * 1.5)));
  float s = exp2(floor(lvl + 0.5));
  float dens = uHatchA.x * 0.45 / s;
  float cluster = smoothstep(0.52, 0.66, lk_vnoise(uv * 1.9 + 17.0));
  if (cluster <= 0.0) return 0.0;
  float dash = smoothstep(0.45, 0.6, lk_vnoise(lk_rot(uHatchA.w + 0.12) * uv * vec2(3.5, 0.9) * uHatchA.x * 0.12));
  return lk_strokes(uv, uHatchA.w + 0.12, dens, 0.07, fwUV, s, 0.37) * cluster * dash * uHatchB.w;
}

// Ashlar masonry: wandering horizontal courses and staggered head joints on walls
// and piers, a paving grid on floors. World space, so it never swims.
float lk_masonry(vec3 p, vec3 n, float fwUV) {
  vec3 a = abs(n);
  bool floorFace = a.y > a.x && a.y > a.z;
  vec2 uv = floorFace ? p.xz : vec2(a.x > a.z ? p.z : p.x, p.y);
  float course = floorFace ? 0.85 : 0.46;
  float blockW = floorFace ? 0.85 : 0.95;
  float ty = uv.y / course + (lk_vnoise(vec2(uv.x * 1.1, floor(uv.y / course) * 3.7)) - 0.5) * 0.08;
  float row = floor(ty);
  float tx = uv.x / blockW + row * 0.5 + lk_hash12(vec2(row, 3.1)) * 0.35;
  float dy = abs(fract(ty + 0.5) - 0.5) * course;
  float dx = abs(fract(tx + 0.5) - 0.5) * blockW;
  // head joints only within their own course (they stop at the bed joints)
  float d = min(dy, dx + step(0.5 - 0.02 / course, abs(fract(ty) - 0.5)) * 9.0);
  float w = 0.006 + 0.009 * lk_vnoise(uv * 3.3);
  float aa = max(fwUV, 1e-4);
  float line = 1.0 - smoothstep(w - aa, w + aa, d);
  // chipped joints: ink breaks where the mortar has weathered away
  line *= smoothstep(0.25, 0.4, lk_vnoise(uv * 2.7 + 5.0));
  return line * (1.0 - smoothstep(w * 0.8, w * 3.0, aa));
}

// I     : light intensity (N.L * atten * shadow * albedo * flicker)
// spec  : wet specular term (already attenuated)
// hp/hn : hatch-space position & normal (world, or object space for the viewmodel)
LkInk lk_ink(float I, float spec, vec3 hp, vec3 hn, float viewDist, float joints) {
  // Hand-carved band edges: bands wander a little, like a gouge following grain.
  float n = texture(uNoise3D, hp * 0.35).r - 0.5;
  I *= 1.0 + n * uBand2.x * 1.4;

  float soft = uBand.w + fwidth(I) * 0.75;
  float m = smoothstep(uBand.x - soft, uBand.x + soft, I);
  float l = smoothstep(uBand.y - soft, uBand.y + soft, I);
  float h = smoothstep(uBand.z - soft, uBand.z + soft, I);

  vec3 midC = mix(uOil, uEmber, uBand2.y);
  vec3 col = mix(uInk, midC, m);
  col = mix(col, uEmber, l);
  col = mix(col, uCream, h);

  vec2 uv = lk_planeUV(hp, hn);
  float fwUV = length(fwidth(uv));
  float k = 1.0 - lk_sat((I - uBand.x) / max(uBand.y - uBand.x, 1e-3));

  float ink = 0.0;
  if (uHatchC.x > 0.5) {
    // Only pay for strokes where they can show (derivatives were taken above).
    float wMid = m * (1.0 - l);
    float wLit = l * (1.0 - h);
    if (wMid > 0.002) ink = lk_hatch(uv, k, viewDist, fwUV) * wMid;
    if (wLit > 0.002 && uHatchB.w > 0.0) ink = max(ink, lk_gouges(uv, viewDist, fwUV) * wLit);
  }
  if (joints > 0.0 && m > 0.002) ink = max(ink, lk_masonry(hp, hn, fwUV) * joints * m * (1.0 - 0.45 * h));
  col = mix(col, uInk, ink);

  float s = smoothstep(uBand2.z - soft, uBand2.z + soft, spec);
  col = mix(col, uCream, s);

  LkInk r;
  r.color = col;
  r.light = lk_sat(m * 0.35 + l * 0.45 + h * 0.2 + s * 0.2);
  return r;
}

#endif
