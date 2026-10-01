// Fire jet particles (off-hand blast through the lantern). CPU-simulated positions.
attribute float aAge;   // 0..1 normalised life
attribute float aSeed;
varying float vAge;
varying float vSeed;
uniform float uPxScale;
void main() {
  vAge = aAge;
  vSeed = aSeed;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float size = mix(0.04, 0.32, sqrt(aAge)) * (0.7 + aSeed * 0.6);
  gl_PointSize = clamp(size * uPxScale / max(-mv.z, 0.1), 2.0, 220.0);
  gl_Position = projectionMatrix * mv;
}
