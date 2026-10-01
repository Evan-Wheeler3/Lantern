// Black oily water: stretched, warped planar reflection of the lantern-lit world,
// an anisotropic glint streak of the flame, drip/footstep ripple rings and a slow
// drifting oil sheen drawn as contour lines (orange/brown only, no iridescence).
#include <lk_common>
#include <lk_lighting>
#include <lk_ink>

layout(location = 1) out highp vec4 gNormal;

#define MAX_RIPPLES 16

uniform sampler2D uReflection;
uniform vec4 uRipples[MAX_RIPPLES]; // x, z, startTime, strength
uniform vec4 uWaterA;  // reflectivity, distortion, stretch, rippleStrength
uniform vec4 uWaterB;  // sheen, sheenScale, sheenSpeed, glint
uniform vec4 uWaterC;  // bands, hatch, reflTaps, unused

varying vec3 vWorldPos;
varying vec4 vReflCoord;
varying float vViewDist;

float lk_posterize(float x, float steps) {
  if (steps < 1.5) return x;
  float q = x * steps;
  float f = fract(q);
  float w = fwidth(q) + 0.08;
  // Round up early so faint reflections keep a first step instead of vanishing.
  return (floor(q) + smoothstep(0.3 - w, 0.3 + w, f)) / steps;
}

void main() {
  vec2 p = vWorldPos.xz;
  float t = uTime;

  // --- surface slope: slow swell from the noise volume (two octaves, drifting) ---
  vec3 q = vec3(p * 0.21, t * 0.018);
  const float e = 0.03;
  float h0 = texture(uNoise3D, q).r;
  float hx = texture(uNoise3D, q + vec3(e, 0.0, 0.0)).r;
  float hz = texture(uNoise3D, q + vec3(0.0, e, 0.0)).r;
  vec2 grad = vec2(hx - h0, hz - h0) / e * 0.012;
  vec3 q2 = vec3(p * 0.9 + vec2(t * 0.02, -t * 0.013), t * 0.05 + 0.37);
  float g0 = texture(uNoise3D, q2).g;
  float gx = texture(uNoise3D, q2 + vec3(e, 0.0, 0.0)).g;
  float gz = texture(uNoise3D, q2 + vec3(0.0, e, 0.0)).g;
  grad += vec2(gx - g0, gz - g0) / e * 0.006;

  // --- ripple rings (drips, footsteps) ---
  for (int i = 0; i < MAX_RIPPLES; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 3.5) continue;
    vec2 dv = p - r.xy;
    float dist = length(dv) + 1e-4;
    float x = dist - age * 0.42;               // distance behind the wave front
    float env = x > 0.0 ? exp(-x * x * 60.0) : exp(-x * x * 5.0); // sharp front, trailing rings
    float decay = exp(-age * 1.35) * r.w / (1.0 + dist * 2.0);
    grad += (dv / dist) * cos(x * 34.0) * env * decay * 0.55 * uWaterA.w;
  }

  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = lk_sat(dot(N, V));

  // --- oil film: contour lines of a slowly advected scalar field ---
  vec3 sq = vec3(p * 0.09 * uWaterB.y + vec2(t * 0.004, t * 0.003) * uWaterB.z, t * 0.006 * uWaterB.z);
  float oil = texture(uNoise3D, sq).r * 0.7 + texture(uNoise3D, sq * 2.3 + 0.5).g * 0.3;
  float contour = oil * 11.0 + t * 0.03 * uWaterB.z;
  float cfw = fwidth(contour);
  float cd = abs(fract(contour) - 0.5);
  float oilLine = (1.0 - smoothstep(0.025 - cfw, 0.025 + cfw, 0.5 - cd)) * (1.0 - smoothstep(0.3, 0.7, cfw));
  // film tears: contours break up instead of reading as a map
  oilLine *= smoothstep(0.35, 0.6, texture(uNoise3D, sq * 3.1 + 0.2).b);
  float oilPatch = smoothstep(0.35, 0.65, oil);

  // --- reflection: warped by slope, stretched vertically toward the viewer ---
  vec2 ruv = vReflCoord.xy / vReflCoord.w;
  ruv += N.xz * uWaterA.y * vec2(0.6, 1.0) * (1.0 + 2.0 / (1.0 + vViewDist));
  float fres = mix(0.35, 1.0, pow(1.0 - ndv, 3.0));
  float stretch = uWaterA.z * (0.35 + 0.65 * fres);
  vec3 refl = vec3(0.0);
  float wsum = 0.0;
  int taps = int(uWaterC.z);
  float tj = lk_ign(gl_FragCoord.xy) - 0.5; // per-pixel tap jitter: streaks, not dotted copies
  for (int i = 0; i < 12; i++) {
    if (i >= taps) break;
    float fi = (float(i) + 0.5 + tj) / float(taps) - 0.5;
    float w = 1.0 - abs(fi) * 1.6;
    vec2 o = vec2(fi * stretch * 0.08, fi * stretch);
    refl += texture(uReflection, ruv + o).rgb * w;
    wsum += w;
  }
  refl /= max(wsum, 1e-4);
  refl *= uWaterA.x * fres * mix(0.7, 1.2, oilPatch);

  // Woodcut: break the reflection into horizontal engraved lines.
  float fwUV = length(fwidth(p));
  float lines = lk_strokes(p, 1.5708, uHatchA.x * 0.5 / exp2(floor(max(0.0, log2(vViewDist / (uHatchB.z * 2.0))))),
                           0.16, fwUV, 1.0, 0.0);
  refl *= 1.0 - lines * uWaterC.y * lk_sat(lk_luma(refl) * 4.0);

  // Toon the reflection: a few hard tone steps.
  float rl = lk_luma(refl);
  float rq = lk_posterize(lk_sat(rl / 0.8), uWaterC.x) * 0.8;
  refl *= rq / max(rl, 1e-4);

  // --- direct light on the water: anisotropic streak glint + faint lit murk ---
  vec3 toL = uLightPos - vWorldPos;
  float d = length(toL);
  vec3 L = toL / d;
  float atten = lk_attenuation(d) * lk_spot(-L);
  float sh = atten > 0.001 ? lk_shadow(vWorldPos + vec3(0.0, 0.05, 0.0), vec3(0.0, 1.0, 0.0)) : 0.0;
  vec3 H = normalize(L + V);
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), V));   // across view
  vec3 B = normalize(cross(N, T));                       // toward viewer on plane
  float ht = dot(H, T) / 0.018, hb = dot(H, B) / 0.1, hn = max(dot(H, N), 1e-3);
  float glint = exp(-(ht * ht + hb * hb) / (hn * hn)) * atten * sh * uLightIntensity * uWaterB.w;
  glint = lk_posterize(lk_sat(glint), 3.0);

  vec3 col = uInk * 0.6;
  col += uOil * 1.4 * atten * sh * uLightIntensity * (0.4 + 0.6 * oilPatch); // barely-lit murk: water stays black
  col += refl;
  // oil contours glow faintly where light touches
  float sheenLight = lk_sat(atten * sh * uLightIntensity * 1.5);
  col = mix(col, mix(uOil * 5.0, uEmber * 0.6, sheenLight), oilLine * uWaterB.x * sheenLight * 0.6);
  col = mix(col, uCream, lk_sat(glint) );
  col += uEmber * max(glint - 1.0, 0.0);

  gl_FragColor = vec4(col, 1.0);
  vec3 vn = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
  gNormal = vec4(vn * 0.5 + 0.5, lk_sat(atten * sh * uLightIntensity * 2.0 + lk_luma(refl) * 2.0));
}
