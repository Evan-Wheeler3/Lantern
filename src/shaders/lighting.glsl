// lk_lighting — the ONE light in the world: the lantern flame.
// No ambient, no hemisphere, no environment. Outside its reach is ink.
#ifndef LK_LIGHTING
#define LK_LIGHTING

uniform float uTime;
uniform vec3  uLightPos;       // world space, flickers/jitters
uniform vec3  uLightColor;     // linear, ember<->cream flicker tint
uniform float uLightIntensity; // already includes flicker + focus boost
uniform float uLightRange;     // metres, hard window
uniform vec3  uSpotDir;        // world space forward of the lantern
uniform float uFocus;          // 0 = wide glow, 1 = focused beam (animated)
uniform vec3  uSpot;           // cosOuter, cosInner, leak
uniform samplerCube uShadowMap;// R = distance from light (metres)
uniform vec3  uShadow;         // bias, normalOffset, pcfRadius
uniform int   uShadowTaps;     // 1 or 5

float lk_attenuation(float d) {
  float x = d / uLightRange;
  float x2 = x * x;
  float win = lk_sat(1.0 - x2 * x2);
  win *= win;
  // Soft inverse-square with a broad core: the lantern should carve a readable
  // ~4 m pool of light, a hatched ring beyond it, then ink.
  return win / (1.0 + 0.08 * d * d);
}

// dirFromLight: normalised vector light -> point
float lk_spot(vec3 dirFromLight) {
  float c = dot(dirFromLight, uSpotDir);
  float cone = smoothstep(uSpot.x, uSpot.y, c);
  // Shutters leak a little everywhere, but only forward-ish hemisphere gets it.
  float leak = uSpot.z * smoothstep(-0.6, 0.4, c);
  return mix(1.0, max(cone, leak), uFocus);
}

float lk_shadowTap(vec3 dir, float dist, float bias) {
  float stored = texture(uShadowMap, dir).r;
  return step(dist - bias, stored);
}

// Point shadow from the cube distance map, normal-offset + optional 5-tap PCF.
float lk_shadow(vec3 worldPos, vec3 N) {
  vec3 toP = worldPos - uLightPos;
  float d0 = length(toP);
  vec3 p = worldPos + N * uShadow.y * (0.4 + 0.06 * d0);
  vec3 dir = p - uLightPos;
  float dist = length(dir);
  float bias = uShadow.x * (1.0 + dist * 0.08);
  float s = lk_shadowTap(dir, dist, bias);
  if (uShadowTaps > 1) {
    vec3 n = dir / dist;
    vec3 t = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    float r = uShadow.z * dist;
    s += lk_shadowTap(dir + t * r, dist, bias);
    s += lk_shadowTap(dir - t * r, dist, bias);
    s += lk_shadowTap(dir + b * r, dist, bias);
    s += lk_shadowTap(dir - b * r, dist, bias);
    s *= 0.2;
  }
  return s;
}

// ---- Kindled beacons --------------------------------------------------------
// Up to LK_MAX_BEACONS extra fires. No shadow maps: each fire is confined to its
// room's bounds (xz box) instead, which stops light leaking through walls.
#define LK_MAX_BEACONS 8
uniform vec4 uBeaconPos[LK_MAX_BEACONS]; // xyz, intensity (0 = unlit)
uniform vec4 uBeaconBox[LK_MAX_BEACONS]; // minX, minZ, maxX, maxZ

float lk_beaconAtten(int i, vec3 p, out vec3 L) {
  vec4 b = uBeaconPos[i];
  L = vec3(0.0, 1.0, 0.0);
  if (b.w <= 0.0) return 0.0;
  vec4 bx = uBeaconBox[i];
  if (p.x < bx.x || p.x > bx.z || p.z < bx.y || p.z > bx.w) return 0.0;
  vec3 tl = b.xyz - p;
  float d = length(tl);
  L = tl / max(d, 1e-4);
  float x = d / 16.0;
  float win = lk_sat(1.0 - x * x * x * x);
  return win * win / (1.0 + 0.05 * d * d) * b.w;
}

// Summed diffuse from all kindled beacons (N may be zero for "ambient-ish" use).
float lk_beacons(vec3 p, vec3 N) {
  float s = 0.0;
  for (int i = 0; i < LK_MAX_BEACONS; i++) {
    vec3 L;
    float a = lk_beaconAtten(i, p, L);
    if (a <= 0.0) continue;
    s += a * (dot(N, N) > 0.0 ? max(dot(N, L), 0.0) : 1.0);
  }
  return s;
}

#endif
