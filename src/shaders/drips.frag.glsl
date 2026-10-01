layout(location = 1) out highp vec4 gNormal;
uniform vec3 uCream;
uniform vec3 uEmber;
varying float vBright;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // falling streak: thin vertical sliver
  float a = (1.0 - smoothstep(0.03, 0.08, abs(c.x))) * (1.0 - smoothstep(0.2, 0.5, abs(c.y)));
  if (a <= 0.0) discard;
  gl_FragColor = vec4(mix(uEmber, uCream, 0.6) * vBright * a, 1.0);
  gNormal = vec4(0.0);
}
