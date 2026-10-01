// Stone, iron, leather: toon bands + world-anchored crosshatch + hard wet glints.
#include <lk_common>
#include <lk_lighting>
#include <lk_ink>

layout(location = 1) out highp vec4 gNormal;

uniform float uWetHeight; // below this world height everything is soaked
uniform float uObjectHatch;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vHatchPos;
varying vec3 vHatchNormal;
varying float vTone;
varying float vGloss;
varying float vViewDist;

void main() {
  float fs = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vWorldNormal) * fs;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 toL = uLightPos - vWorldPos;
  float d = length(toL);
  vec3 L = toL / max(d, 1e-4);

  float ndl = max(dot(N, L), 0.0);
  float atten = lk_attenuation(d) * lk_spot(-L);
  float sh = atten > 0.001 ? lk_shadow(vWorldPos, N) : 0.0;

  // Wetness: dark, glossy near the waterline, plus per-vertex gloss (iron, wet stone).
  float wet = max(vGloss, lk_sat(1.0 - (vWorldPos.y - 0.02) / max(uWetHeight, 0.01)));
  float albedo = vTone * mix(1.0, 0.72, wet);

  float I = ndl * atten * sh * uLightIntensity * albedo;
  I += lk_beacons(vWorldPos, N) * albedo;

  vec3 H = normalize(L + V);
  float specPow = uBand2.w * mix(0.6, 1.6, wet);
  float spec = pow(max(dot(N, H), 0.0), specPow) * atten * sh * uLightIntensity * wet * step(0.0, dot(N, L));

  // Stone gets masonry joints; iron, coal, leather and the viewmodel do not.
  float joints = (1.0 - uObjectHatch) * step(vGloss, 0.5) * step(0.5, vTone);
  LkInk r = lk_ink(I, spec, vHatchPos, vHatchNormal * fs, vViewDist, joints);

  gl_FragColor = vec4(r.color, 1.0);
  gNormal = vec4(normalize(vViewNormal * fs) * 0.5 + 0.5, r.light);
}
