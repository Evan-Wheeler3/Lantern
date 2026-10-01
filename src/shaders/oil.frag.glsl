// Spilled lamp oil: a black mirror slightly thicker than the water, with slow
// hairline ember rings and a faint glimmer so it can be found in the dark.
#include <lk_common>
#include <lk_lighting>
layout(location = 1) out highp vec4 gNormal;
uniform vec3 uEmber;
uniform vec3 uCream;
uniform vec3 uInk;
uniform float uFill;   // 0..1 how much is left
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float edge = 0.75 + 0.25 * lk_vnoise(c * 6.0 + 3.0);
  if (r > edge * mix(0.35, 1.0, uFill)) discard;
  vec3 toL = uLightPos - vWorldPos;
  float d = length(toL);
  float lit = lk_attenuation(d) * lk_spot(-toL / d) * uLightIntensity + lk_beacons(vWorldPos, vec3(0.0, 1.0, 0.0));
  float rings = r * 9.0 - uTime * 0.25 + lk_vnoise(c * 4.0 + uTime * 0.05) * 1.5;
  float fw = fwidth(rings);
  float line = 1.0 - smoothstep(0.0, fw * 1.2, abs(fract(rings) - 0.5) - 0.5 + fw * 1.2);
  float glimmer = 0.035 + 0.025 * sin(uTime * 2.0 + r * 6.0);
  vec3 col = uInk * 0.3 + uEmber * line * (glimmer + lk_sat(lit) * 0.8);
  // a hard cream glint where the lantern catches it
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 H = normalize(toL / d + V);
  float spec = pow(max(H.y, 0.0), 220.0) * lit;
  col = mix(col, uCream, step(0.5, spec));
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5, lk_sat(lit));
}
