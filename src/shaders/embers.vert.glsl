// Stateless floating embers: world-anchored drift, wrapped in a box around the camera,
// "ignited" (bright) only near the lantern.
#include <lk_common>
#include <lk_lighting>

attribute vec4 aSeed;
uniform vec3 uBox;
uniform float uSize;
uniform float uPxScale;  // drawingBufferHeight / (2 * tan(fov/2))

varying float vBright;
varying float vHeat;

void main() {
  vec3 s = aSeed.xyz;
  float t = uTime;
  vec3 drift = vec3(
    sin(t * 0.21 + s.x * 20.0) * 0.6 + t * 0.06,
    t * (0.08 + s.y * 0.16),
    cos(t * 0.17 + s.z * 17.0) * 0.6 - t * 0.03);
  vec3 p = s * uBox + drift;
  p = cameraPosition + (mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5);
  p.x += sin(t * 1.7 + s.y * 30.0) * 0.06;
  p.z += cos(t * 1.3 + s.x * 25.0) * 0.06;
  p.y = max(p.y, 0.02);

  float d = distance(p, uLightPos);
  float heat = exp(-d * 0.75);
  float tw = 0.55 + 0.45 * sin(t * (2.0 + aSeed.w * 7.0) + s.x * 50.0);
  // Brightness from proximity to the flame only (not the beam boost): embers near
  // the lantern glow hot enough to bloom, the rest are dim sparks.
  vBright = (heat * 3.0 + lk_attenuation(d) * 0.35) * tw * (1.0 - 0.5 * uFocus);
  vHeat = heat;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = uSize * (0.4 + aSeed.w) * uPxScale / max(-mv.z, 0.1) * 0.012;
  vBright *= clamp(size / 1.5, 0.15, 1.0); // sub-pixel embers fade instead of shimmering
  gl_PointSize = clamp(size, 1.5, 14.0);
  gl_Position = projectionMatrix * mv;
}
