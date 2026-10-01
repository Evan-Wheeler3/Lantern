// Shadow creatures: absolute black mass, only a thin ember rim betrays the form.
#include <lk_common>
#include <lk_lighting>
#include <lk_ink>

layout(location = 1) out highp vec4 gNormal;

uniform vec3 uRim; // power, threshold, base visibility

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
  float reach = lk_sat(uRim.z + lk_attenuation(d) * lk_spot(-toL / d) * uLightIntensity * 2.5);

  float fres = 1.0 - lk_sat(dot(N, V));
  // Rim lives only on the silhouette; the shimmer makes it feel like heat haze.
  float shimmer = 0.85 + 0.3 * lk_vnoise(vHatchPos.xy * 9.0 + vec2(0.0, uTime * 1.3));
  // Back faces (the inside of the cloak seen through the hem) stay pure black.
  float rim = gl_FrontFacing ? pow(fres, uRim.x) * reach * shimmer : 0.0;
  float w = fwidth(rim) * 1.2 + 0.015;
  float line = smoothstep(uRim.y - w, uRim.y + w, rim);
  float hot = smoothstep(uRim.y + 0.35 - w, uRim.y + 0.35 + w, rim);

  vec3 col = mix(vec3(0.0), uEmber, line);
  col = mix(col, uCream, hot * 0.6);

  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(normalize(vViewNormal * fs) * 0.5 + 0.5, 0.0);
}
