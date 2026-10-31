import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Tilt-shift plus a warm postcard grade in one cheap pass: a soft blur that
 * grows away from a horizontal focus band, a touch of warmth and a vignette.
 */
const PostcardShader = {
  name: 'PostcardShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    focus: { value: 0.52 },
    band: { value: 0.16 },
    blur: { value: 2.2 },
    warmth: { value: 0.045 },
    vignette: { value: 0.15 },
    night: { value: 0 },
    bloom: { value: 0.18 },
    bloomTaps: { value: 4 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float focus;
    uniform float band;
    uniform float blur;
    uniform float warmth;
    uniform float vignette;
    uniform float night;
    uniform float bloom;
    uniform int bloomTaps;
    varying vec2 vUv;
    vec3 bright(vec2 offset) {
      vec3 c = texture2D(tDiffuse, vUv + offset / resolution).rgb;
      // HDR threshold: only the bright amber emissives bloom, not moonlit walls.
      return c * smoothstep(1.8, 3.2, max(c.r, max(c.g, c.b)));
    }
    void main() {
      float dist = max(0.0, abs(vUv.y - focus) - band);
      float amount = smoothstep(0.0, 0.45, dist) * blur;
      vec2 px = amount / resolution;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + vec2( 1.3846,  0.0) * px) * 0.1581081081;
      c += texture2D(tDiffuse, vUv + vec2(-1.3846,  0.0) * px) * 0.1581081081;
      c += texture2D(tDiffuse, vUv + vec2( 0.0,  1.3846) * px) * 0.1581081081;
      c += texture2D(tDiffuse, vUv + vec2( 0.0, -1.3846) * px) * 0.1581081081;
      c += texture2D(tDiffuse, vUv + vec2( 2.2,  2.2) * px) * 0.0351351351;
      c += texture2D(tDiffuse, vUv + vec2(-2.2,  2.2) * px) * 0.0351351351;
      c += texture2D(tDiffuse, vUv + vec2( 2.2, -2.2) * px) * 0.0351351351;
      c += texture2D(tDiffuse, vUv + vec2(-2.2, -2.2) * px) * 0.0351351351;
      vec3 col = c.rgb;
      if (night > 0.01) {
        vec3 halo = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          if (i >= bloomTaps) break;
          float angle = float(i) * 6.283185 / float(bloomTaps);
          vec2 dir = vec2(cos(angle), sin(angle));
          vec3 glow = bright(dir * 6.0);
          if (bloomTaps > 4) glow = glow * 0.6 + bright(dir * 12.0) * 0.4;
          halo += glow / float(bloomTaps);
        }
        col += halo * bloom * night;
      }
      // A gentle inkier toe and a little chroma retain the painted pastel palette.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.1);
      col = max(vec3(0.0), (col - 0.018) * 1.035);
      col *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth * 0.5);
      vec2 v = vUv - 0.5;
      col *= 1.0 - vignette * dot(v, v) * 1.6;
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

export type QualityPreset = 'low' | 'medium' | 'high';

export interface RenderSettings {
  quality: QualityPreset;
  /** Multiplier on the capped device pixel ratio. */
  resolutionScale: number;
}

const PIXEL_RATIO_CAP: Record<QualityPreset, number> = { low: 1, medium: 1.5, high: 2 };

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private postcard: ShaderPass | null = null;
  private settings: RenderSettings = { quality: 'medium', resolutionScale: 1 };
  contextLost = false;

  constructor(
    container: HTMLElement,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    onContextChange: (lost: boolean) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'world';
    this.canvas.setAttribute('aria-label', 'Donostia, seen from above');
    this.canvas.tabIndex = -1;
    container.appendChild(this.canvas);

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      onContextChange(true);
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.rebuildComposer();
      onContextChange(false);
    });

    this.apply(this.settings);
    window.addEventListener('resize', this.resize);
    // Display scaling changes (moving between monitors) don't fire resize everywhere.
    this.watchPixelRatio();
  }

  private watchPixelRatio(): void {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener(
      'change',
      () => {
        this.resize();
        this.watchPixelRatio();
      },
      { once: true },
    );
  }

  apply(settings: RenderSettings): void {
    this.settings = settings;
    const shadowSize = settings.quality === 'high' ? 2048 : settings.quality === 'medium' ? 1536 : 1024;
    this.scene.traverse((o) => {
      const light = o as THREE.DirectionalLight;
      if (light.isDirectionalLight && light.castShadow) {
        light.shadow.mapSize.set(shadowSize, shadowSize);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
    });
    this.rebuildComposer();
    this.resize();
  }

  private rebuildComposer(): void {
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose();
      this.composer.dispose();
    }
    this.composer = null;
    this.renderPass = null;
    this.postcard = null;
    if (this.settings.quality === 'low') return;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.postcard = new ShaderPass(PostcardShader);
    this.postcard.uniforms.bloom.value = this.settings.quality === 'high' ? 0.26 : 0.18;
    this.postcard.uniforms.bloomTaps.value = this.settings.quality === 'high' ? 8 : 4;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.postcard);
    this.composer.addPass(new OutputPass());
  }

  get pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[this.settings.quality]) * this.settings.resolutionScale;
  }

  resize = (): void => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
    }
    if (this.postcard) {
      this.postcard.uniforms.resolution.value.set(w * this.pixelRatio, h * this.pixelRatio);
      // Keep the blur proportional to the physical size of the screen.
      this.postcard.uniforms.blur.value = 2.0 * this.pixelRatio;
    }
  };

  /** Tilt-shift strength, 0 removes it (e.g. during close cinematics). */
  setTiltShift(amount: number): void {
    if (this.postcard) this.postcard.uniforms.blur.value = 2.0 * this.pixelRatio * amount;
  }

  render(): void {
    if (this.contextLost) return;
    if (this.postcard) this.postcard.uniforms.night.value = Number(this.scene.userData.night) || 0;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Render one frame and return a small JPEG snapshot of it for a polaroid. */
  snapshot(width = 480, height = 360): string {
    this.render();
    const src = this.canvas;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return '';
    // Crop the centre of the frame to the polaroid aspect.
    const aspect = width / height;
    let sw = src.width;
    let sh = src.width / aspect;
    if (sh > src.height) {
      sh = src.height;
      sw = sh * aspect;
    }
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, width, height);
    try {
      return out.toDataURL('image/jpeg', 0.86);
    } catch {
      return '';
    }
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }
}
