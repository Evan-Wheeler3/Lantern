// Shadow creatures: absolute black mass, only a thin ember rim betrays the form.
#include <lk_common>
#include <lk_lighting>
#include <lk_ink>

layout(location = 1) out highp vec4 gNormal;

uniform vec3 uRim;       // power, threshold, base visibility
uniform float uCharge;   // 0..1 beam charge: the outline thickens and heats
uniform float uFrozen;   // 0..1 remaining freeze: white-hot outline
uniform float uDissolve; // 0..1 burning away (death)
uniform float uHurt;     // 0..1 flash when scorched

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
  float glow = clamp(max(uCharge, uFrozen), 0.0, 1.0);
  float reach = lk_sat(uRim.z + lk_attenuation(d) * lk_spot(-toL / d) * uLightIntensity * 2.5 + glow);

  // Death: burn away from the edges of a noise field, with a hot cream margin.
  float burn = lk_vnoise(vHatchPos.xy * 7.0 + vHatchPos.z * 3.0) * 0.7 + lk_vnoise(vHatchPos.zy * 17.0) * 0.3;
  if (burn < uDissolve * 1.05) discard;
  float burnEdge = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.08, burn - uDissolve * 1.05) : 0.0;

  float fres = 1.0 - lk_sat(dot(N, V));
  // Rim lives only on the silhouette; the shimmer makes it feel like heat haze.
  float shimmer = 0.85 + 0.3 * lk_vnoise(vHatchPos.xy * 9.0 + vec2(0.0, uTime * 1.3));
  // Back faces (the inside of the cloak seen through the hem) stay pure black.
  float rim = gl_FrontFacing ? pow(fres, uRim.x) * reach * shimmer : 0.0;
  float w = fwidth(rim) * 1.2 + 0.015;
  // Charging lowers the cut, so the outline thickens as the beam holds them.
  float thr = mix(uRim.y, uRim.y * 0.3, glow);
  float line = smoothstep(thr - w, thr + w, rim);
  float hot = smoothstep(thr + 0.35 - w, thr + 0.35 + w, rim);

  vec3 lineCol = uEmber * (1.0 + glow * 1.8);
  // Frozen: the outline goes white-hot (HDR, so it blooms) and pulses as it fades.
  float pulse = 0.8 + 0.2 * sin(uTime * (6.0 + 10.0 * (1.0 - uFrozen)));
  lineCol = mix(lineCol, uCream * 3.0 * pulse, step(0.001, uFrozen));
  vec3 col = mix(vec3(0.0), lineCol, line);
  col = mix(col, uCream * (1.0 + 2.0 * glow), hot * 0.6);
  // Charge engraves the body: object-space strokes thicken with the charge,
  // and a frozen creature is cross-hatched in white-hot lines.
  vec2 huv = vHatchPos.xy + vHatchPos.z * 0.35;
  float fwh = length(fwidth(huv));
  if (glow > 0.01) {
    float hw = 0.04 + 0.16 * glow;
    float st = lk_strokes(huv, 0.75, 34.0, hw, fwh, 1.0, 0.0);
    if (uFrozen > 0.0) st = max(st, lk_strokes(huv, -0.6, 34.0, hw * 0.8, fwh, 1.0, 0.5));
    vec3 hc = uFrozen > 0.0 ? uCream * 1.6 * pulse : uEmber * (0.35 + 0.9 * glow);
    col = max(col, hc * st * smoothstep(0.0, 0.25, glow));
  }
  col += uEmber * uHurt * 0.6;
  col = mix(col, uCream * 4.0, burnEdge);

  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(normalize(vViewNormal * fs) * 0.5 + 0.5, 0.0);
}
