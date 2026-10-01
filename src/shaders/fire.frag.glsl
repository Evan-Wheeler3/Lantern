// Licks of flame cut into two hard tones (cream core, ember edge), HDR for bloom.
#include <lk_common>
layout(location = 1) out highp vec4 gNormal;
uniform vec3 uEmber;
uniform vec3 uCream;
uniform float uTime;
varying float vAge;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float n = lk_vnoise(c * 5.0 + vec2(vSeed * 31.0, uTime * 3.0));
  float r = length(c) * 2.0 + (n - 0.5) * 0.6;
  float fade = 1.0 - vAge;
  float outer = 1.0 - smoothstep(0.75, 0.9, r + vAge * 0.4);
  if (outer <= 0.0) discard;
  float core = 1.0 - smoothstep(0.35, 0.45, r + vAge * 0.9);
  // fade in as the star front opens, so the lantern mouth doesn't bloom into a blob
  float open = smoothstep(0.0, 0.3, vAge);
  vec3 col = mix(uEmber * 1.2, uCream * 2.6, core) * fade * fade * open;
  gl_FragColor = vec4(col * outer, 1.0);
  gNormal = vec4(0.0);
}
