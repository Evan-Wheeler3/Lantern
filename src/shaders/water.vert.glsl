uniform mat4 uReflMatrix;
varying vec3 vWorldPos;
varying vec4 vReflCoord;
varying float vViewDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vReflCoord = uReflMatrix * wp;
  vec4 mv = viewMatrix * wp;
  vViewDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
