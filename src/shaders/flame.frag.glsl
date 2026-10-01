// Lantern flame: noise-licked teardrop cut into three hard bands, HDR so bloom
// only ever picks up the flame (and hot embers).
#include <lk_common>

layout(location = 1) out highp vec4 gNormal;

uniform float uTime;
uniform float uFlicker;   // 0..1 instantaneous brightness from the lantern system
uniform vec3 uEmber;
uniform vec3 uCream;
uniform float uFlameGain;
uniform float uLean;     // draft: the tip bends toward an open door

varying vec2 vUv;

void main() {
  float y = vUv.y;
  float x = (vUv.x - 0.5) * 2.0;
  float n1 = lk_vnoise(vec2(y * 3.0 - uTime * 5.3, uTime * 1.3));
  float n2 = lk_vnoise(vec2(y * 8.0 - uTime * 11.0, 4.0 + uTime * 2.1));
  x += ((n1 - 0.5) * 0.8 + (n2 - 0.5) * 0.3) * y * y;
  x -= uLean * y * y * 1.4;

  float height = 0.72 + 0.28 * uFlicker + (n1 - 0.5) * 0.12;
  float yy = y / height;
  float w = sin(LK_PI * pow(clamp(yy, 0.0, 1.0), 0.62)) * 0.92;
  float d = yy >= 1.0 ? 2.0 : abs(x) / max(w, 1e-3);

  float fw = fwidth(d) + 0.02;
  float outer = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, d);
  float mid = 1.0 - smoothstep(0.62 - fw, 0.62 + fw, d + yy * 0.25);
  float core = 1.0 - smoothstep(0.34 - fw, 0.34 + fw, d + yy * 0.55);
  // Dark root where the wick is: the woodcut "cut" at the base.
  float root = smoothstep(0.02, 0.1, yy);

  vec3 col = uEmber * 2.5;
  col = mix(col, uCream * 5.0, mid);
  col = mix(col, uCream * 11.0, core * root);
  col *= (0.65 + 0.55 * uFlicker) * uFlameGain;

  gl_FragColor = vec4(col, outer);
  gNormal = vec4(0.0);
}
