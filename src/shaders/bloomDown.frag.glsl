// Dual-Kawase downsample.
uniform sampler2D tInput;
uniform vec2 uTexel; // of the SOURCE
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture(tInput, vUv).rgb * 4.0;
  c += texture(tInput, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture(tInput, vUv + vec2( o.x, -o.y)).rgb;
  c += texture(tInput, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture(tInput, vUv + vec2( o.x,  o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
