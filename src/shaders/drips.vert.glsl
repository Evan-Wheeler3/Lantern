#include <lk_common>
#include <lk_lighting>
attribute float aAlpha;
uniform float uPxScale;
varying float vBright;
void main() {
  float d = distance(position, uLightPos);
  vBright = (lk_attenuation(d) * lk_spot((position - uLightPos) / max(d, 1e-3)) * uLightIntensity * 3.0 + 0.015) * aAlpha;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float size = uPxScale / max(-mv.z, 0.1) * 0.05;
  vBright *= clamp(size / 2.0, 0.2, 1.0);
  gl_PointSize = clamp(size, 2.0, 40.0);
  gl_Position = projectionMatrix * mv;
}
