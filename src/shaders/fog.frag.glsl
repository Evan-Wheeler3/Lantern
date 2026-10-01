// Volumetric lantern light. Raymarches only the segment of the view ray that lies
// inside the light's range sphere, samples the cube shadow map per step (so pillars
// cut real shafts through the haze) and drifting 3D noise for density.
// Output: R = in-scattered light, G = transmittance, B = linear depth (bilateral key).
#include <lk_common>
#include <lk_lighting>

uniform sampler2D tDepth;
uniform sampler3D uNoise3D;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec2 uNearFar;
uniform int uSteps;
uniform float uFrame;
uniform vec4 uFogA; // density, noiseScale, noiseStrength, heightFalloff
uniform vec2 uFogB; // anisotropy g, extinction
uniform vec3 uCamPos;

varying vec2 vUv;

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * LK_PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

void main() {
  float z = texture(tDepth, vUv).r;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec4 vp = uInvProj * ndc;
  vp /= vp.w;
  float linZ = -vp.z;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
  vec3 ro = uCamPos;
  vec3 rd = wp - ro;
  float sceneDist = length(rd);
  rd /= max(sceneDist, 1e-4);

  // Clip the march to the light's sphere of influence.
  vec3 oc = ro - uLightPos;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - uLightRange * uLightRange;
  float h = b * b - c;
  float scatter = 0.0;
  float T = 1.0;
  if (h > 0.0) {
    h = sqrt(h);
    float t0 = max(-b - h, 0.0);
    float t1 = min(-b + h, sceneDist);
    if (t1 > t0) {
      float n = float(uSteps);
      float dt = (t1 - t0) / n;
      float jitter = lk_ign(gl_FragCoord.xy + uFrame * vec2(5.588, 3.1));
      float t = t0 + dt * jitter;
      for (int i = 0; i < 64; i++) {
        if (i >= uSteps) break;
        vec3 p = ro + rd * t;
        vec3 toP = p - uLightPos;
        float dl = length(toP);
        vec3 ld = toP / max(dl, 1e-4);
        float atten = lk_attenuation(dl) * lk_spot(ld);
        float vis = 0.0;
        if (atten > 0.002) {
          vis = step(dl - 0.08, texture(uShadowMap, toP).r);
        }
        vec3 nq = p * uFogA.y * 0.12 + vec3(uTime * 0.011, uTime * 0.017, -uTime * 0.007);
        float nz = texture(uNoise3D, nq).r;
        nz = mix(nz, texture(uNoise3D, nq * 2.7 + 0.31).g, 0.35);
        float dens = uFogA.x * max(1.0 + (nz - 0.5) * 2.0 * uFogA.z, 0.0);
        dens *= mix(1.0, exp(-max(p.y, 0.0) * uFogA.w), 0.8) + 0.2 * exp(-max(p.y, 0.0) * 4.0);
        float ph = hg(dot(ld, -rd), uFogB.x) * 4.0 * LK_PI * 0.5 + 0.5;
        // Keep the air right in front of the eyes clear: a light held at arm's length
        // would otherwise fog the whole screen. Bloom sells the near glow instead.
        float nearFade = smoothstep(0.6, 2.2, t);
        // atten^1.5: haze hugs the flame and the beam instead of filling the room.
        scatter += T * dens * atten * sqrt(atten) * vis * ph * nearFade * dt;
        T *= exp(-dens * dt * uFogB.y);
        t += dt;
      }
    }
  }
  gl_FragColor = vec4(scatter * uLightIntensity, T, linZ, 1.0);
}
