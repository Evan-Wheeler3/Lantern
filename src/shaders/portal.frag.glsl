// The opened exit: a field of hot cream light behind the sealed door.
#include <lk_common>
layout(location = 1) out highp vec4 gNormal;
uniform vec3 uCream;
uniform vec3 uEmber;
uniform float uTime;
uniform float uOpen;
varying vec2 vUv;
void main() {
  float n = lk_vnoise(vUv * vec2(6.0, 10.0) + vec2(0.0, -uTime * 0.8));
  float band = step(0.5, fract(vUv.y * 9.0 + n * 1.5 - uTime * 0.3));
  vec3 col = mix(uEmber * 1.4, uCream * 2.6, mix(0.6, 1.0, band)) * uOpen;
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
}
