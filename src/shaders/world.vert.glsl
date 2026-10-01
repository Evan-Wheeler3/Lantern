// Shared vertex stage for every lit solid (architecture, chains, viewmodel, creatures).
attribute float aTone;   // albedo 0..1 (how much light the surface returns)
attribute float aGloss;  // wetness / metal 0..1

uniform float uObjectHatch;   // 1 = hatch in object space (viewmodel), 0 = world
uniform float uHatchObjScale;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vHatchPos;
varying vec3 vHatchNormal;
varying float vTone;
varying float vGloss;
varying float vViewDist;

void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 wp = m * vec4(position, 1.0);
  vec3 wn = normalize(mat3(m) * normal);
  vWorldPos = wp.xyz;
  vWorldNormal = wn;
  vViewNormal = mat3(viewMatrix) * wn;
  vHatchPos = mix(wp.xyz, position * uHatchObjScale, uObjectHatch);
  vHatchNormal = mix(wn, normal, uObjectHatch);
  vTone = aTone;
  vGloss = aGloss;
  vec4 mv = viewMatrix * wp;
  vViewDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
