// Final print: ink outlines -> volumetric light -> bloom -> "printing" on luminance
// (exposure, contrast, paper, grain, vignette) -> map onto the 4-colour palette ramp.
// Everything that leaves this shader is a blend of ink / oil / ember / cream.
#include <lk_common>

uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tFog;
uniform sampler2D tBloom;
uniform sampler2D tPaper;
uniform vec2 uResolution;
uniform vec2 uNearFar;
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uOil;
uniform vec3 uEmber;
uniform vec3 uCream;
uniform vec3 uLightColor;
uniform vec4 uRampStops;   // luminance of ink, oil, ember, cream (linear)
uniform vec4 uOutA;        // width px, depthThreshold, normalThreshold, wobble px
uniform vec4 uOutB;        // wobbleFreq, boilFps, darkVisibility, darkGlow
uniform vec4 uPostA;       // exposure, contrast, bloom, grain
uniform vec4 uPostB;       // paper, vignette, paletteStrength, posterize
uniform float uFogIntensity;
uniform float uDebugView;  // 0 final, 1 color, 2 normals, 3 light term, 4 fog, 5 edges

varying vec2 vUv;

float linZ(vec2 uv) {
  float d = texture(tDepth, uv).r;
  float n = uNearFar.x, f = uNearFar.y;
  return n * f / (f - d * (f - n));
}

vec3 nrm(vec4 s) { return s.xyz * 2.0 - 1.0; }

vec3 paletteRamp(float L) {
  vec4 s = uRampStops;
  if (L <= s.y) return mix(uInk, uOil, lk_sat((L - s.x) / max(s.y - s.x, 1e-5)));
  if (L <= s.z) return mix(uOil, uEmber, lk_sat((L - s.y) / max(s.z - s.y, 1e-5)));
  return mix(uEmber, uCream, lk_sat((L - s.z) / max(s.w - s.z, 1e-5)));
}

vec3 fogBilateral(vec2 uv, float zc) {
  vec2 fs = vec2(textureSize(tFog, 0));
  vec2 p = uv * fs - 0.5;
  vec2 f = fract(p);
  vec2 b = (floor(p) + 0.5) / fs;
  vec2 dx = vec2(1.0 / fs.x, 0.0), dy = vec2(0.0, 1.0 / fs.y);
  vec3 s0 = texture(tFog, b).rgb;
  vec3 s1 = texture(tFog, b + dx).rgb;
  vec3 s2 = texture(tFog, b + dy).rgb;
  vec3 s3 = texture(tFog, b + dx + dy).rgb;
  float k = 1.0 / (zc * 0.08 + 1e-3);
  float w0 = (1.0 - f.x) * (1.0 - f.y) * exp(-abs(s0.b - zc) * k) + 1e-5;
  float w1 = f.x * (1.0 - f.y) * exp(-abs(s1.b - zc) * k) + 1e-5;
  float w2 = (1.0 - f.x) * f.y * exp(-abs(s2.b - zc) * k) + 1e-5;
  float w3 = f.x * f.y * exp(-abs(s3.b - zc) * k) + 1e-5;
  return (s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3) / (w0 + w1 + w2 + w3);
}

void main() {
  vec2 tx = 1.0 / uResolution;
  float aspectY = uResolution.y;

  // ---- ink outlines: depth + normal discontinuities, wobbly, variable weight ----
  float boil = uOutB.y > 0.0 ? floor(uTime * uOutB.y) : 0.0;
  vec2 seed = vec2(boil * 17.13, boil * 5.71);
  vec2 sp = gl_FragCoord.xy / aspectY * uOutB.x * 4.0;
  vec2 wob = (vec2(lk_vnoise(sp + seed), lk_vnoise(sp + seed + 31.7)) - 0.5) * 2.0 * uOutA.w;
  vec2 uc = vUv + wob * tx;

  float zC = linZ(uc);
  float th = uOutA.x * (0.55 + 0.9 * lk_vnoise(gl_FragCoord.xy / aspectY * 7.0 + seed * 0.37 + 7.0));
  th *= mix(1.5, 0.7, lk_sat(zC / 20.0));
  vec2 ox = vec2(th, 0.0) * tx, oy = vec2(0.0, th) * tx;

  float zL = linZ(uc - ox), zR = linZ(uc + ox), zD = linZ(uc - oy), zU = linZ(uc + oy);
  float dEdge = abs(1.0 / zL + 1.0 / zR + 1.0 / zU + 1.0 / zD - 4.0 / zC) * zC;

  vec4 nC = texture(tNormal, uc);
  vec4 nL = texture(tNormal, uc - ox), nR = texture(tNormal, uc + ox);
  vec4 nD = texture(tNormal, uc - oy), nU = texture(tNormal, uc + oy);
  vec3 c = nrm(nC);
  float nEdge = max(max(1.0 - dot(c, nrm(nL)), 1.0 - dot(c, nrm(nR))),
                    max(1.0 - dot(c, nrm(nD)), 1.0 - dot(c, nrm(nU))));
  float edge = max(smoothstep(uOutA.y, uOutA.y * 2.0, dEdge),
                   smoothstep(uOutA.z, uOutA.z * 1.6, nEdge));
  float lightMax = max(nC.a, max(max(nL.a, nR.a), max(nD.a, nU.a)));
  float vis = mix(uOutB.z, 1.0, smoothstep(0.02, 0.3, lightMax));

  vec3 col = texture(tColor, vUv).rgb;
  col = mix(col, uInk, edge * vis);
  col += uEmber * edge * (1.0 - vis) * uOutB.w;

  // ---- volumetric lantern light ----
  vec3 fog = fogBilateral(vUv, linZ(vUv));
  col = col * fog.g + uLightColor * fog.r * uFogIntensity;

  // ---- flame bloom ----
  col += texture(tBloom, vUv).rgb * uPostA.z;

  // ---- print on luminance ----
  float L = lk_luma(col) * uPostA.x;
  float P = pow(max(L, 0.0), 1.0 / 2.2);
  P = pow(P, uPostA.y);

  vec4 paper = texture(tPaper, gl_FragCoord.xy / 512.0);
  P *= mix(1.0, 0.78 + 0.32 * paper.r, uPostB.x);
  P += (paper.g - 0.5) * 0.035 * uPostB.x * (1.0 - P);

  float g = lk_hash12(gl_FragCoord.xy + fract(floor(uTime * 24.0) * 0.618034) * 917.0) - 0.5;
  P += g * uPostA.w * (0.12 + P);

  vec2 q = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float v = 1.0 - smoothstep(0.3, 1.05, length(q));
  P *= mix(1.0, v, uPostB.y);

  if (uPostB.w > 1.5) {
    float steps = uPostB.w;
    P = floor(P * steps + lk_ign(gl_FragCoord.xy) * 0.6 + 0.2) / steps;
  }
  L = pow(max(P, 0.0), 2.2);

  vec3 ramp = paletteRamp(L);
  vec3 raw = col * uPostA.x / (1.0 + lk_luma(col * uPostA.x));
  vec3 outc = mix(raw, ramp, uPostB.z);

  if (uDebugView > 0.5) {
    if (uDebugView < 1.5) outc = texture(tColor, vUv).rgb;
    else if (uDebugView < 2.5) outc = pow(nC.rgb, vec3(2.2));
    else if (uDebugView < 3.5) outc = vec3(nC.a);
    else if (uDebugView < 4.5) outc = vec3(fog.r * 2.0, fog.g * 0.25, 0.0);
    else if (uDebugView < 5.5) outc = vec3(edge * vis);
    else {
      // NaN / Inf hunt: R = scene colour, G = fog, B = bloom
      vec3 sc = texture(tColor, vUv).rgb;
      vec3 bl = texture(tBloom, vUv).rgb;
      vec3 fg = texture(tFog, vUv).rgb;
      outc = vec3(any(isnan(sc)) || any(isinf(sc)) ? 1.0 : 0.0,
                  any(isnan(fg)) || any(isinf(fg)) ? 1.0 : 0.0,
                  any(isnan(bl)) || any(isinf(bl)) ? 1.0 : 0.0);
    }
  }

  gl_FragColor = vec4(lk_linearToSRGB(outc) + (lk_ign(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}
