// Flame-only bloom: threshold is far above anything a lit surface can reach.
#include <lk_common>
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  // 4-tap box to stabilise tiny HDR sources (embers) before thresholding
  vec3 c = texture(tInput, vUv + uTexel * vec2(-0.5, -0.5)).rgb
         + texture(tInput, vUv + uTexel * vec2( 0.5, -0.5)).rgb
         + texture(tInput, vUv + uTexel * vec2(-0.5,  0.5)).rgb
         + texture(tInput, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
  c *= 0.25;
  float l = lk_luma(c);
  float knee = uThreshold * 0.5;
  float s = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  s = s * s / (4.0 * knee + 1e-4);
  float w = max(s, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(40.0)), 1.0);
}
