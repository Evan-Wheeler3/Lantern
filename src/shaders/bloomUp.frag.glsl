// Dual-Kawase upsample, added onto the next-larger level.
uniform sampler2D tInput;   // smaller level
uniform sampler2D tBase;    // same-size level from the down chain
uniform vec2 uTexel;        // of the SOURCE (smaller)
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 c = vec3(0.0);
  c += texture(tInput, vUv + vec2(-2.0 * o.x, 0.0)).rgb;
  c += texture(tInput, vUv + vec2( 2.0 * o.x, 0.0)).rgb;
  c += texture(tInput, vUv + vec2(0.0, -2.0 * o.y)).rgb;
  c += texture(tInput, vUv + vec2(0.0,  2.0 * o.y)).rgb;
  c += texture(tInput, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  c += texture(tInput, vUv + vec2( o.x, -o.y)).rgb * 2.0;
  c += texture(tInput, vUv + vec2(-o.x,  o.y)).rgb * 2.0;
  c += texture(tInput, vUv + vec2( o.x,  o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture(tBase, vUv).rgb, 1.0);
}
