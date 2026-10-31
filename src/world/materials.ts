import * as THREE from 'three';
import { mulberry32 } from '../engine/random.ts';

/**
 * Shared uniforms for the "peek-through" cutaway. Building fragments that sit
 * between the camera and the crew dissolve with a soft dither, so the friends
 * stay visible in narrow lanes without the camera ever jumping.
 */
/** 0 by day, 1 when windows glow amber at night. Shared by every facade. */
export const windowGlow = { value: 0 };
/** Shared decorative water clock, frozen by the world's reduced-motion setting. */
export const waterTime = { value: 0 };

export const cutaway = {
  uFocus: { value: new THREE.Vector3() },
  uCam: { value: new THREE.Vector3() },
  uCutRadius: { value: 3.6 },
  uCutEnabled: { value: 1 },
};

export function applyCutaway<T extends THREE.Material>(
  material: T,
  extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
  cacheKey = 'cutaway',
  radiusScale = 1,
): T {
  material.onBeforeCompile = (shader) => {
    extra?.(shader);
    Object.assign(shader.uniforms, cutaway);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 cutPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutPos = instanceMatrix * cutPos;
        #endif
        vCutWorld = (modelMatrix * cutPos).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCutWorld;
        uniform vec3 uFocus;
        uniform vec3 uCam;
        uniform float uCutRadius;
        uniform float uCutEnabled;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uCutEnabled > 0.5) {
          vec3 seg = uCam - uFocus;
          float segLen2 = max(dot(seg, seg), 1e-4);
          float t = dot(vCutWorld - uFocus, seg) / segLen2;
          if (t > 0.0 && t < 1.0 && vCutWorld.y > uFocus.y - 1.2) {
            vec3 closest = uFocus + seg * t;
            float dist = length(vCutWorld - closest);
            // A cone narrowing toward the camera keeps the hole a constant size on screen.
            float radius = uCutRadius * ${radiusScale.toFixed(2)} * (1.0 - t * 0.8);
            float edge = 1.0 - smoothstep(radius * 0.8, radius, dist);
            // Ordered 4x4 dither so the hole edge reads as soft, not cut.
            vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
            float idx = cell.x + cell.y * 4.0;
            float threshold = fract(idx * 0.4375 + floor(idx / 4.0) * 0.1875) * 0.94 + 0.03;
            if (edge > threshold) discard;
          }
        }
        // Open the foreground roofs around the two old-town architectural sights.
        // This is a visual dollhouse cut only; footprints and camera collision stay intact.
        bool atChurch = distance(uFocus.xz, vec2(68.5, 3.6)) < 6.0;
        bool atPlaza = distance(uFocus.xz, vec2(78.5, 6.0)) < 6.5;
        // The church postcard looks down Calle Mayor. Peel the intervening roofs
        // for that shot too, while leaving the church itself completely intact.
        bool churchPhoto = uCutEnabled < 0.5 && distance(uFocus.xz, vec2(68.5, -2.0)) < 0.5 && uCam.z > 10.0;
        if (churchPhoto && abs(vCutWorld.x - 68.5) < 4.2 && vCutWorld.z > 2.1 && vCutWorld.z < uCam.z + 1.0 && vCutWorld.y > 2.8) discard;
        if (${radiusScale >= 0.9 ? 'true' : 'false'} && uCutEnabled > 0.5 && (atChurch || atPlaza) &&
            vCutWorld.z < uFocus.z - 0.8 && distance(vCutWorld.xz, uFocus.xz) < 12.0 &&
            vCutWorld.y > uFocus.y + 1.5) discard;`,
      );
  };
  // Distinct cache key so three doesn't share the program with plain materials.
  material.customProgramCacheKey = () => `${cacheKey}-${radiusScale}`;
  return material;
}

/**
 * Windows, shutters and balconies painted on a canvas, plus a matching mask.
 * The mask is white where there is plaster, so the building's vertex colour
 * tints only the walls and the glass, frames and shutters keep their colours.
 */
export function facadeTextures(kind: 'row' | 'oldtown'): { map: THREE.CanvasTexture; mask: THREE.CanvasTexture } {
  const size = 128;
  const rng = mulberry32(kind === 'row' ? 813 : 1813);
  const speckles = Array.from({ length: 220 }, () => [rng() * size, rng() * size, rng() * 0.05]);
  const paint = (mask: boolean): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d')!;
    const detail = (colour: string) => (mask ? '#000000' : colour);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    if (!mask) {
      for (const [x, y, a] of speckles) {
        g.fillStyle = `rgba(150,120,90,${a})`;
        g.fillRect(x, y, 2, 2);
      }
      // A soft cornice line between floors.
      g.fillStyle = 'rgba(120,90,70,0.12)';
      g.fillRect(0, size - 8, size, 8);
    }
    const ww = kind === 'oldtown' ? 46 : 40;
    const wh = kind === 'oldtown' ? 70 : 62;
    const wx = (size - ww) / 2;
    const wy = 26;
    // Shutters: sage in the old town, pale grey-blue on the boulevard.
    g.fillStyle = detail(kind === 'oldtown' ? '#376d61' : '#688c93');
    g.fillRect(wx - 14, wy, 12, wh);
    g.fillRect(wx + ww + 2, wy, 12, wh);
    g.fillStyle = detail(kind === 'oldtown' ? '#254f48' : '#50717b');
    for (let y = wy + 5; y < wy + wh; y += 7) {
      g.fillRect(wx - 13, y, 10, 2);
      g.fillRect(wx + ww + 3, y, 10, 2);
    }
    // Glass catching the sky: light at the top, deeper below.
    if (mask) {
      // Green marks glass, so windows can glow warm at night.
      g.fillStyle = '#00ff00';
    } else {
      const grad = g.createLinearGradient(0, wy, 0, wy + wh);
      grad.addColorStop(0, '#80b8c6');
      grad.addColorStop(0.45, '#3e7185');
      grad.addColorStop(1, '#234b64');
      g.fillStyle = grad;
    }
    g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = detail('#fbf6ec');
    g.lineWidth = 4;
    g.strokeRect(wx, wy, ww, wh);
    g.beginPath();
    g.moveTo(size / 2, wy);
    g.lineTo(size / 2, wy + wh);
    g.stroke();
    // Little wrought-iron balcony rail.
    g.fillStyle = detail('#4a4a52');
    g.fillRect(wx - 8, wy + wh - 6, ww + 16, 4);
    for (let x = wx - 6; x < wx + ww + 8; x += 6) g.fillRect(x, wy + wh - 18, 2, 14);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = mask ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
  return { map: paint(false), mask: paint(true) };
}

/** Shader patch: tint by vertex colour only where the plaster mask is white. */
export function plasterTint(mask: THREE.Texture): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    shader.uniforms.uPlasterMask = { value: mask };
    shader.uniforms.uWindowGlow = windowGlow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPlasterMask;\nuniform float uWindowGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #if defined( USE_MAP )
          vec4 facadeMask = texture2D(uPlasterMask, vMapUv);
          // Roughly two windows in three are lit, chosen per window cell.
          vec2 cellId = floor(vMapUv);
          float lit = step(0.33, fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453));
          totalEmissiveRadiance += vec3(1.0, 0.53, 0.17) * facadeMask.g * (1.0 - facadeMask.r) * lit * uWindowGlow * 4.2;
        #endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#if defined( USE_COLOR ) && defined( USE_MAP )
          float plaster = texture2D(uPlasterMask, vMapUv).r;
          diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, plaster);
        #else
          #include <color_fragment>
        #endif`,
      );
  };
}

/** One shared outline material for inverted-hull outlines on characters and props. */
export const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x4a3328, side: THREE.BackSide });
