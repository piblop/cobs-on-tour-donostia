import * as THREE from 'three';
import { mulberry32 } from '../engine/random.ts';

export type Surface = 'paving' | 'cobbles' | 'sand' | 'grass' | 'tiles';

/** Small, seamless paintings; all variation is independent of the game seed. */
export function surfaceTexture(kind: Surface): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rng = mulberry32(701 + ['paving', 'cobbles', 'sand', 'grass', 'tiles'].indexOf(kind));
  g.fillStyle = kind === 'cobbles' ? '#969b9c' : kind === 'tiles' ? '#b6aaa0' : kind === 'sand' ? '#fff9ec' : '#c9cdc8';
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
  } else {
    // Restrained wind ripples, with grain instead of a noisy normal map.
    g.strokeStyle = 'rgba(144,115,76,0.13)'; g.lineWidth = 1;
    for (let y = -16; y < 272; y += 16) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 4) g.lineTo(x, y + Math.sin(x * Math.PI / 64) * 3);
      g.stroke();
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

/** World projection gives ribbons, boxes and separate lawns the same scale. */
export function surfaceMaterial(kind: Surface, color: string, vertexColors = false): THREE.MeshLambertMaterial {
  const map = surfaceTexture(kind);
  const m = new THREE.MeshLambertMaterial({ color, map, vertexColors });
  const scale = kind === 'sand' ? 3 : kind === 'grass' ? 7 : 4;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vMapUv = (modelMatrix * vec4(transformed, 1.0)).xz / ${scale.toFixed(1)};
    `);
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
