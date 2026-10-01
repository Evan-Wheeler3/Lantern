// Writes radial distance from the lantern into the cube map (R channel).
uniform vec3 uLightPos;
varying vec3 vWorldPos;
void main() {
  gl_FragColor = vec4(length(vWorldPos - uLightPos), 0.0, 0.0, 1.0);
}
