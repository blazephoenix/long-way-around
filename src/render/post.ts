// Post-process: ink outlines from depth (silhouettes) and depth-reconstructed normals
// (creases), distance/fog-aware, tinted by time of day. Optional film look for the viewfinder
// and for saved photos (grain, vignette, warm tint).
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform mat4 uProjInv;
uniform vec3 uInk;
uniform vec3 uFog;
uniform float uInkStrength;
uniform float uLineFar;
uniform float uThick;
uniform float uFilm;
uniform float uTime;
uniform float uFade;
uniform float uFlash;
uniform float uBlur;
uniform float uFocusMiss;
uniform float uLowFuel;
uniform float uDebug;
varying vec2 vUv;

vec3 viewPos(vec2 uv){
  float z = texture2D(tDepth, uv).x;
  vec4 c = vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec4 v = uProjInv * c;
  return v.xyz / v.w;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

void main(){
  vec2 px = uThick / uRes;
  vec3 col = texture2D(tColor, vUv).rgb;
  // motion blur / defocus approximation for the film look
  if (uBlur > 0.001) {
    vec3 acc = col;
    for (int i = 1; i <= 4; i++) {
      float f = float(i) * uBlur * 0.004;
      acc += texture2D(tColor, vUv + vec2(f, 0.0)).rgb + texture2D(tColor, vUv - vec2(f, 0.0)).rgb;
    }
    col = acc / 9.0;
  }
  if (uFocusMiss > 0.001) {
    vec3 acc = col;
    float r = uFocusMiss * 0.006;
    acc += texture2D(tColor, vUv + vec2(r, 0.0)).rgb;
    acc += texture2D(tColor, vUv - vec2(r, 0.0)).rgb;
    acc += texture2D(tColor, vUv + vec2(0.0, r)).rgb;
    acc += texture2D(tColor, vUv - vec2(0.0, r)).rgb;
    col = acc / 5.0;
  }

  vec3 p0 = viewPos(vUv);
  vec3 pl = viewPos(vUv - vec2(px.x, 0.0));
  vec3 pr = viewPos(vUv + vec2(px.x, 0.0));
  vec3 pd = viewPos(vUv - vec2(0.0, px.y));
  vec3 pu = viewPos(vUv + vec2(0.0, px.y));
  float d0 = -p0.z;
  float dl = -pl.z, dr = -pr.z, dd = -pd.z, du = -pu.z;
  float dmin = min(d0, min(min(dl, dr), min(dd, du)));

  // silhouettes: second derivative of linear depth (flat slopes give zero)
  float lap = abs(dl + dr - 2.0 * d0) + abs(dd + du - 2.0 * d0);
  float edgeD = smoothstep(0.035, 0.09, lap / max(dmin, 0.05));

  // creases: compare normals of the two half-neighbourhoods
  vec3 nA = normalize(cross(pr - p0, pu - p0));
  vec3 nB = normalize(cross(p0 - pl, p0 - pd));
  float edgeN = smoothstep(0.55, 0.25, dot(nA, nB)) * step(dmin, 400.0);

  float e = max(edgeD, edgeN * 0.85);
  e *= 1.0 - smoothstep(uLineFar * 0.45, uLineFar, dmin);
  // cockpit and very near geometry: keep lines thinner/weaker
  e *= mix(0.65, 1.0, smoothstep(0.3, 2.0, dmin));
  vec3 ink = mix(uInk, col * 0.35 + uInk * 0.5, 0.25);
  // fade ink toward fog colour with distance so far ridgelines read softly
  float fogK = smoothstep(uLineFar * 0.3, uLineFar, dmin);
  ink = mix(ink, uFog, fogK * 0.6);
  col = mix(col, ink, clamp(e * uInkStrength, 0.0, 1.0));

  // low fuel: a subtle mood shift (slightly cooler, a touch desaturated)
  if (uLowFuel > 0.001) {
    float l = dot(col, vec3(0.299,0.587,0.114));
    col = mix(col, vec3(l) * vec3(0.95,0.98,1.04), uLowFuel * 0.18);
  }

  if (uFilm > 0.001) {
    // warm tint, gentle s-curve, vignette, grain
    vec3 f = col * vec3(1.06, 1.0, 0.9);
    f = mix(f, f * f * (3.0 - 2.0 * f), 0.25);
    vec2 q = vUv - 0.5;
    float vig = 1.0 - dot(q, q) * 1.1;
    f *= mix(1.0, vig, 0.85);
    float g = hash(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
    f += g * 0.07;
    f = max(f, vec3(0.025, 0.02, 0.03)); // lifted film blacks
    col = mix(col, f, uFilm);
  }
  if (uDebug > 0.5) col = vec3(fract(d0 / 20.0), e, edgeN);
  col = mix(col, vec3(1.0), uFlash);
  col *= uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class PostFX {
  readonly material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  rt: THREE.WebGLRenderTarget;
  scale = 1;

  constructor(w: number, h: number) {
    this.rt = PostFX.makeRT(w, h);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        uRes: { value: new THREE.Vector2(w, h) },
        uProjInv: { value: new THREE.Matrix4() },
        uInk: { value: new THREE.Color(0x222222) },
        uFog: { value: new THREE.Color(0xaaaaaa) },
        uInkStrength: { value: 0.9 },
        uLineFar: { value: 420 },
        uThick: { value: 1.0 },
        uFilm: { value: 0 },
        uTime: { value: 0 },
        uFade: { value: 1 },
        uFlash: { value: 0 },
        uBlur: { value: 0 },
        uFocusMiss: { value: 0 },
        uLowFuel: { value: 0 },
        uDebug: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  static makeRT(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    rt.depthTexture.format = THREE.DepthFormat;
    return rt;
  }

  setSize(w: number, h: number) {
    this.rt.setSize(w, h);
    (this.material.uniforms.uRes.value as THREE.Vector2).set(w, h);
    this.material.uniforms.uThick.value = Math.max(1.3, Math.min(2.6, h / 560));
  }

  /** Render scene with outlines (and optional film look) to target (null = screen). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget | null, src = this.rt) {
    renderer.setRenderTarget(src);
    renderer.render(scene, camera);
    const u = this.material.uniforms;
    u.tColor.value = src.texture;
    u.tDepth.value = src.depthTexture;
    (u.uRes.value as THREE.Vector2).set(src.width, src.height);
    (u.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
}
