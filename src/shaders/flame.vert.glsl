// Cylindrical billboard: keeps the lantern's up axis, faces the camera.
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 upV = normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0));
  vec3 rightV = normalize(cross(upV, vec3(0.0, 0.0, 1.0)));
  vec3 pos = center.xyz + rightV * position.x + upV * position.y;
  gl_Position = projectionMatrix * vec4(pos, 1.0);
}
