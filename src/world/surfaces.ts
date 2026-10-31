import * as THREE from 'three';
import { mulberry32 } from '../engine/random.ts';

export type Surface = 'paving' | 'cobbles' | 'sand' | 'grass' | 'tiles';

/** Small, seamless paintings; all variation is independent of the game seed. */
export function surfaceTexture(kind: Surface): THREE.CanvasTexture {
  if (kind === 'sand') return sandTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rng = mulberry32(701 + ['paving', 'cobbles', 'sand', 'grass', 'tiles'].indexOf(kind));
  g.fillStyle = kind === 'cobbles' ? '#969b9c' : kind === 'tiles' ? '#b6aaa0' : '#c9cdc8';
  g.fillRect(0, 0, 256, 256);
  if (kind === 'paving' || kind === 'cobbles' || kind === 'tiles') {
    const rows = kind === 'paving' ? 4 : 8;
    const h = 256 / rows;
    const w = kind === 'paving' ? 64 : kind === 'tiles' ? 32 : 48;
    // Cobble width divides the tile too, keeping the staggered repeat seamless.
    const step = kind === 'cobbles' ? 64 : w;
    for (let row = 0; row < rows; row++) {
      for (let x = -step; x < 256; x += step) {
        const xx = x + (row % 2) * step / 2;
        const v = Math.floor((kind === 'paving' ? 230 : kind === 'tiles' ? 225 : 204) + rng() * (kind === 'paving' ? 18 : 28));
        g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
        g.beginPath();
        g.roundRect(xx + 2, row * h + 2, step - 4, h - 4, kind === 'cobbles' ? 7 : 1);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.24)';
        g.fillRect(xx + 4, row * h + 3, step - 8, 2);
        if (kind === 'tiles') {
          g.fillStyle = 'rgba(65,35,22,0.09)';
          g.fillRect(xx + step - 5, row * h + 3, 2, h - 5);
        }
      }
    }
    if (kind === 'paving') {
      // Dark little diamond inlays break up the pale limestone grid.
      g.fillStyle = '#839b9c';
      for (let y = 0; y <= 256; y += 128) for (let x = 0; x <= 256; x += 128) {
        g.beginPath();
        g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y);
        g.fill();
      }
    }
  } else if (kind === 'grass') {
    g.fillStyle = '#e5eadf'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      const x = rng() * 256, y = rng() * 256, r = 4 + rng() * 18;
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
        const patch = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        patch.addColorStop(0, 'rgba(83,112,62,0.12)'); patch.addColorStop(1, 'rgba(83,112,62,0)');
        g.fillStyle = patch; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(62,50,38,0.055)' : 'rgba(255,255,245,0.16)';
    g.fillRect(rng() * 256, rng() * 256, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}

/** Wrap a draw call around the tile edges so the painting repeats seamlessly. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    if (x + dx < -r || x + dx > size + r || y + dy < -r || y + dy > size + r) continue;
    draw(x + dx, y + dy);
  }
}

/**
 * Beach sand: soft damp-and-dry mottling, shaded wind ripples, mixed grains
 * (quartz, ochre, grey), and the odd pebble and shell fleck. Painted at a
 * higher resolution than the other surfaces because the camera sees so much of it.
 */
function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rng = mulberry32(709);
  g.fillStyle = '#fff6e2';
  g.fillRect(0, 0, S, S);

  // Broad patches, a little warmer or paler, so no two metres look the same.
  for (let i = 0; i < 70; i++) {
    const x = rng() * S, y = rng() * S, r = 20 + rng() * 60;
    const warm = rng() < 0.55;
    wrapped(S, x, y, r, (px, py) => {
      const p = g.createRadialGradient(px, py, 0, px, py, r);
      p.addColorStop(0, warm ? 'rgba(214,168,104,0.13)' : 'rgba(255,255,248,0.22)');
      p.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = p;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }

  // Wind ripples: a shaded trough with a sunlit crest just above it.
  // Spacing and wavelengths divide the tile, and each ripple is also drawn one
  // tile up and down, so they meet themselves at every edge.
  const RIPPLES = 24;
  for (let k = 0; k < RIPPLES; k++) {
    const phase = rng() * Math.PI * 2;
    const amp = 3 + rng() * 4;
    for (const y of [k * S / RIPPLES - S, k * S / RIPPLES, k * S / RIPPLES + S]) {
      const wave = (x: number) => y + Math.sin((x / S) * Math.PI * 2 * 3 + phase) * amp + Math.sin((x / S) * Math.PI * 2 * 7 + phase * 2) * 1.4;
      g.lineWidth = 3.2;
      g.strokeStyle = 'rgba(150,112,66,0.24)';
      g.beginPath();
      for (let x = 0; x <= S; x += 4) g.lineTo(x, wave(x) + 1.5);
      g.stroke();
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(255,255,250,0.55)';
      g.beginPath();
      for (let x = 0; x <= S; x += 4) g.lineTo(x, wave(x) - 1.6);
      g.stroke();
    }
  }

  // Grains: lots of tiny specks in several colours.
  const grains = ['rgba(120,86,50,0.22)', 'rgba(196,138,72,0.3)', 'rgba(255,255,252,0.7)', 'rgba(128,128,124,0.2)', 'rgba(232,180,110,0.35)'];
  for (let i = 0; i < 22000; i++) {
    g.fillStyle = grains[Math.floor(rng() * grains.length)];
    const sz = rng() < 0.7 ? 1 : 2;
    g.fillRect(rng() * S, rng() * S, sz, sz);
  }

  // Pebbles and shell flecks, each with a tiny shadow and a highlight.
  const pebbles = ['#c9b9a2', '#a99a88', '#e7ddd0', '#d8c2a8', '#9c8f83'];
  for (let i = 0; i < 80; i++) {
    const x = rng() * S, y = rng() * S, rx = 2 + rng() * 4, ry = rx * (0.55 + rng() * 0.35), rot = rng() * Math.PI;
    const shell = rng() < 0.3;
    const col = shell ? (rng() < 0.5 ? '#fff4ec' : '#f3c9b4') : pebbles[Math.floor(rng() * pebbles.length)];
    wrapped(S, x, y, rx + 2, (px, py) => {
      g.fillStyle = 'rgba(110,80,50,0.25)';
      g.beginPath(); g.ellipse(px + 0.8, py + 1.1, rx, ry, rot, 0, Math.PI * 2); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); g.fill();
      if (shell) {
        g.strokeStyle = 'rgba(170,110,90,0.45)'; g.lineWidth = 0.6;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(px, py + ry * 0.8); g.lineTo(px + k * rx * 0.7, py - ry * 0.7); g.stroke(); }
      } else {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.beginPath(); g.ellipse(px - rx * 0.3, py - ry * 0.35, rx * 0.35, ry * 0.3, rot, 0, Math.PI * 2); g.fill();
      }
    });
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** World projection gives ribbons, boxes and separate lawns the same scale. */
export function surfaceMaterial(kind: Surface, color: string, vertexColors = false): THREE.MeshLambertMaterial {
  const map = surfaceTexture(kind);
  const m = new THREE.MeshLambertMaterial({ color, map, vertexColors });
  const scale = kind === 'sand' ? 4 : kind === 'grass' ? 7 : 4;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vMapUv = (modelMatrix * vec4(transformed, 1.0)).xz / ${scale.toFixed(1)};
    `);
    if (kind === 'sand') {
      // Large, slow mottling in world space hides the tile repeat.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        float sandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sandNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(sandHash(i), sandHash(i + vec2(1.0, 0.0)), u.x), mix(sandHash(i + vec2(0.0, 1.0)), sandHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        float sandMottle = sandNoise(vMapUv * 0.8) * 0.6 + sandNoise(vMapUv * 2.9 + 7.3) * 0.4;
        diffuseColor.rgb *= 0.88 + sandMottle * 0.22;`);
    }
  };
  m.customProgramCacheKey = () => `surface-${kind}`;
  return m;
}

/** One shared radial texture for batched contact shadows, including low quality. */
export function contactTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const fade = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  fade.addColorStop(0, 'rgba(24,32,42,0.32)');
  fade.addColorStop(0.55, 'rgba(24,32,42,0.18)');
  fade.addColorStop(1, 'rgba(24,32,42,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Static lace and a feathered edge; lit foam stays quiet after dark. */
export function shoreFoamMaterial(): THREE.MeshLambertMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rng = mulberry32(31415);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 100; i++) {
    const x = rng() * 128, y = rng() * 128, r = 2 + rng() * 8;
    g.fillStyle = `rgba(0,0,0,${0.35 + rng() * 0.65})`;
    for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
      g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
    }
  }
  const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 2;
  const m = new THREE.MeshLambertMaterial({ color: '#f4fff9', map, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFoamEdge;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMapUv = (modelMatrix * vec4(transformed, 1.0)).xz * 0.55;\nvFoamEdge = uv.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFoamEdge;').replace('#include <alphatest_fragment>', `
      #include <alphatest_fragment>
      diffuseColor.a *= smoothstep(0.0, 0.22, vFoamEdge) * (1.0 - smoothstep(0.65, 1.0, vFoamEdge));
    `);
  };
  return m;
}
