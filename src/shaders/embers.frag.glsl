layout(location = 1) out highp vec4 gNormal;
uniform vec3 uEmber;
uniform vec3 uCream;
varying float vBright;
varying float vHeat;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = abs(c.x) + abs(c.y);            // diamond: a cut, not a soft dot
  float a = 1.0 - smoothstep(0.32, 0.5, d);
  if (a <= 0.0) discard;
  vec3 col = mix(uEmber, uCream, smoothstep(0.35, 0.9, vHeat)) * vBright;
  gl_FragColor = vec4(col * a, 1.0);
  gNormal = vec4(0.0);
}
