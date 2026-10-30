import * as THREE from 'three';
import {
  BAY_EAST,
  BAY_WEST,
  BEACH_SLOPE,
  BEACH_Y0,
  CAROUSEL,
  D,
  EAST_LIMIT,
  LANDMARKS,
  OLDTOWN_COLS,
  OLDTOWN_ROWS,
  PLAZA_CELL,
  PROMENADE_Y,
  ROW_EAST,
  SOUTH_LIMIT,
  STAIRS,
  STAIR_BOTTOM_D,
  STAIR_TOP_D,
  bayPoint,
  groundY,
  propLayout,
  projectToShore,
  quayLine,
  shoreNormal,
} from './map.ts';
import { railingRuns } from './collisions.ts';
import { mulberry32 } from '../engine/random.ts';
import { RIVER, SUMMITS, ZURRIOLA } from './map.ts';
import { applyCutaway, waterTime } from './materials.ts';
import { contactTexture, shoreFoamMaterial, surfaceMaterial } from './surfaces.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const lin = (hex: string) => new THREE.Color(hex);

export const PALETTE = {
  seaShallow: '#6cd4c4',
  seaDeep: '#196782',
  foam: '#ffffff',
  sand: '#f5dfa8',
  wetSand: '#b49c78',
  seawall: '#b5afa3',
  promenade: '#f3eee3',
  boulevard: '#c5c5bc',
  town: '#cfcbc0',
  lane: '#aaaeb0',
  plaza: '#d4cbb8',
  lawn: '#9bbf87',
  hill: '#8db07a',
  hillDark: '#759a68',
  rock: '#b9ab98',
  railing: '#fbfbf7',
  skyTop: '#6fb6d9',
  skyMid: '#a9d8e8',
  skyHorizon: '#ffd9b3',
  sunGlow: '#ffc98a',
  cloudLit: '#fff4e8',
  cloudShade: '#e9c3c0',
} as const;

export interface SkyUniforms {
  zenith: { value: THREE.Color };
  mid: { value: THREE.Color };
  horizon: { value: THREE.Color };
  glow: { value: THREE.Color };
  cloudLit: { value: THREE.Color };
  cloudShade: { value: THREE.Color };
  sunDir: { value: THREE.Vector3 };
  discColor: { value: THREE.Color };
  uNight: { value: number };
  uTime: { value: number };
}

export interface Scenery {
  sky: SkyUniforms;
  /** Lamp glass: brightens at dusk. */
  lampGlass: THREE.MeshLambertMaterial;
  /** Warm pools of light under the lamps, faded in at night. */
  lampPools: THREE.MeshBasicMaterial;
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  update(time: number): void;
  dispose(): void;
}

/** Ribbon between two inland distances along the shore curve. */
function bayRibbon(
  fromX0: number,
  toX0: number,
  d1: number,
  d2: number,
  y: (x: number, z: number, d: number) => number,
  color: (d: number) => THREE.Color,
  stepsAlong = 90,
  stepsAcross = 2,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= stepsAlong; i++) {
    const x0 = fromX0 + ((toX0 - fromX0) * i) / stepsAlong;
    for (let j = 0; j <= stepsAcross; j++) {
      const d = d1 + ((d2 - d1) * j) / stepsAcross;
      const p = bayPoint(x0, d);
      pos.push(p.x, y(p.x, p.z, d), p.z);
      uv.push((x0 - fromX0) / 3, j / stepsAcross);
      const c = color(d);
      col.push(c.r, c.g, c.b);
    }
  }
  const w = stepsAcross + 1;
  for (let i = 0; i < stepsAlong; i++) {
    for (let j = 0; j < stepsAcross; j++) {
      const a = i * w + j;
      const b = a + w;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flatRect(minX: number, maxX: number, minZ: number, maxZ: number, y: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
  g.rotateX(-Math.PI / 2);
  g.translate((minX + maxX) / 2, y, (minZ + maxZ) / 2);
  return g;
}

/** Soft radial falloff for light pools. */
function radialGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Low-poly hill: a squashed icosphere with seeded bumps. */
function hillGeometry(radius: number, height: number, seed: number, cap = Infinity): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const rng = mulberry32(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  const bumps = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let b = bumps.get(key);
    if (b === undefined) bumps.set(key, (b = 0.88 + rng() * 0.22));
    const yy = y < 0 ? y * 0.15 : y;
    // Walkable hilltops are flattened into a plateau.
    p.setXYZ(i, x * radius * b, Math.min(yy * height * b, cap), z * radius * b);
  }
  g.computeVertexNormals();
  return g;
}

export function createScenery(): Scenery {
  const group = new THREE.Group();
  group.name = 'scenery';
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const staticMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, shadows = { cast: false, receive: true }) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.castShadow = shadows.cast;
    m.receiveShadow = shadows.receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    return m;
  };

  const surface = (kind: Parameters<typeof surfaceMaterial>[0], color: string, vertexColors = false) => {
    const m = track(surfaceMaterial(kind, color, vertexColors));
    track(m.map!);
    return m;
  };
  const paving = surface('paving', '#ffffff', true);
  const sandSurface = surface('sand', '#ffffff', true);
  const cobbles = surface('cobbles', PALETTE.lane);
  const lawnSurface = surface('grass', PALETTE.lawn);
  const lampGlass = track(new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffcf86', emissiveIntensity: 0.25 }));
  const lampPools = track(
    new THREE.MeshBasicMaterial({
      map: track(radialGlowTexture()),
      color: '#ffcf8a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  lampPools.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;').replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vPoolWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      // Clip the flat pool at the seawall instead of leaving a floating disc over sand.
      if (vPoolWorld.x < 54.0) {
        float x = vPoolWorld.x;
        for (int i = 0; i < 3; i++) {
          float dz = -6.0 - 0.0065 * x * x - vPoolWorld.z;
          float slope = -0.013 * x;
          x -= (x - vPoolWorld.x + dz * slope) / (1.0 + slope * slope - 0.013 * dz);
        }
        float d = dot(vPoolWorld.xz - vec2(x, -6.0 - 0.0065 * x * x), normalize(vec2(0.013 * x, 1.0)));
        if (d < 9.08) discard;
      }
    `);
  };
  const flatVc = track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

  // --- Sky, fog and light ----------------------------------------------------
  // Golden-hour sky: layered gradient, a soft sun with a halo, a warm band
  // along the horizon and drifting procedural clouds lit from the sun's side.
  const skyUniforms = {
    zenith: { value: lin(PALETTE.skyTop) },
    mid: { value: lin(PALETTE.skyMid) },
    horizon: { value: lin(PALETTE.skyHorizon) },
    glow: { value: lin(PALETTE.sunGlow) },
    cloudLit: { value: lin(PALETTE.cloudLit) },
    cloudShade: { value: lin(PALETTE.cloudShade) },
    // The visible sun sits low over Monte Igueldo, the classic sunset side of the bay.
    sunDir: { value: new THREE.Vector3(-0.53, 0.17, -0.83).normalize() },
    discColor: { value: new THREE.Color(1.0, 0.97, 0.88) },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  const skyMat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith;
        uniform vec3 mid;
        uniform vec3 horizon;
        uniform vec3 glow;
        uniform vec3 cloudLit;
        uniform vec3 cloudShade;
        uniform vec3 sunDir;
        uniform vec3 discColor;
        uniform float uNight;
        uniform float uTime;
        varying vec3 vDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            v += amp * noise(p);
            p = p * 2.03 + vec2(1.7, 9.2);
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float sd = max(dot(d, sunDir), 0.0);

          vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.2, h));
          col = mix(col, zenith, smoothstep(0.18, 0.8, h));
          // Warm band hugging the horizon, strongest on the sun's side.
          float band = (1.0 - smoothstep(0.0, 0.28, abs(h))) * (0.35 + 0.65 * pow(sd, 3.0));
          col = mix(col, glow, band * 0.55);
          // Halo and disc.
          col += glow * pow(sd, 24.0) * 0.45;
          col = mix(col, discColor, smoothstep(0.9975, 0.999, sd));
          // Stars come out as the night deepens.
          if (uNight > 0.01 && h > 0.0) {
            vec3 cell = floor(d * 260.0);
            float star = step(0.9965, hash(cell.xy + cell.z * 7.31));
            float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell.zy) * 40.0);
            col += vec3(1.0, 0.96, 0.9) * star * twinkle * smoothstep(0.06, 0.35, h) * uNight * 0.9;
          }

          if (h > 0.0) {
            // Project the dome onto a flat cloud layer so clouds shrink toward the horizon.
            vec2 uv = d.xz / (h + 0.18) * 1.15 + vec2(uTime * 0.012, uTime * 0.005);
            float c = fbm(uv);
            float cover = smoothstep(0.52, 0.76, c) * smoothstep(0.02, 0.16, h);
            // Thick cores are shaded lilac-peach, thin edges glow where the sun hits.
            float thick = smoothstep(0.6, 0.85, c);
            vec3 cloud = mix(cloudLit, cloudShade, thick * 0.65);
            cloud += glow * pow(sd, 5.0) * (1.0 - thick) * 0.6;
            col = mix(col, cloud, cover * 0.9);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(420, 32, 16)), skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  group.add(sky);

  const hemi = new THREE.HemisphereLight(0x91b7de, 0x68677e, 1.05);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c8, 2.3);
  sun.castShadow = true;
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);

  // --- Sea -------------------------------------------------------------------
  const seaGeo = new THREE.PlaneGeometry(700, 420, 140, 84);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(0, 0, -150);
  {
    const p = seaGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const shallow = lin(PALETTE.seaShallow);
    const deep = lin(PALETTE.seaDeep);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      let dist = 80;
      if (x > BAY_WEST - 10 && x < BAY_EAST + 20) dist = Math.max(0, -projectToShore(x, z).d);
      if (x > BAY_EAST) dist = Math.min(dist, Math.max(0, -9.8 - z));
      if (x > RIVER.east) dist = Math.max(0, ZURRIOLA.waterZ - z);
      c.copy(shallow).lerp(deep, Math.min(1, dist / 45));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    seaGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const seaMat = track(
    new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      emissive: '#1d6e78',
      emissiveIntensity: 0.1,
      specular: '#ffe0b0',
      shininess: 70,
    }),
  );
  seaMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWater;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w = sin(position.x * 0.21 + uTime * 0.9) * 0.10 + sin(position.z * 0.17 - uTime * 1.1) * 0.12
                + sin((position.x + position.z) * 0.33 + uTime * 1.7) * 0.05;
        float coast = (-6.0 - 0.0065 * position.x * position.x - position.z) / sqrt(1.0 + pow(0.013 * position.x, 2.0));
        if (position.x > 44.0) coast = -9.8 - position.z;
        if (position.x > 107.0) coast = -31.0 - position.z;
        transformed.y += w * smoothstep(0.0, 10.0, coast) - 0.025;
        vWater = position.xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWater;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ripple = sin(vWater.x * 2.2 + sin(vWater.y * 0.7) + uTime * 0.4)
                     * sin(vWater.y * 3.1 - uTime * 0.3);
        float glint = smoothstep(0.98, 1.0, ripple) * 0.045;
        diffuseColor.rgb *= 0.97 + ripple * 0.035;
        totalEmissiveRadiance += vec3(0.35, 0.7, 0.72) * glint;
      `);
  };
  const sea = new THREE.Mesh(track(seaGeo), seaMat);
  sea.receiveShadow = true;
  sea.matrixAutoUpdate = false;
  group.add(sea);

  // Foam along the waterline, gently breathing.
  const foamMat = track(shoreFoamMaterial());
  track(foamMat.map!);
  const foam = staticMesh(
    bayRibbon(BAY_WEST, BAY_EAST, -0.6, 0.45, (_x, _z, d) => 0.075 + Math.max(0, d) * BEACH_SLOPE, () => new THREE.Color(1, 1, 1), 120, 2),
    foamMat,
  );
  foam.renderOrder = 1;

  // --- Beach, sea wall, promenade -------------------------------------------
  const sand = lin(PALETTE.sand);
  const wet = lin(PALETTE.wetSand);
  staticMesh(
    bayRibbon(
      BAY_WEST,
      BAY_EAST,
      -2.5,
      D.seawall - 0.4,
      // Plain beach slope; the stairs and sea wall are separate meshes.
      (_x, _z, d) => (d < 0 ? BEACH_Y0 + d * 0.18 : BEACH_Y0 + BEACH_SLOPE * d),
      (d) => wet.clone().lerp(sand, THREE.MathUtils.smoothstep(d, 0.3, 3.0)),
      120,
      8,
    ),
    sandSurface,
  );
  const wallCol = lin(PALETTE.seawall);
  for (const [a, b] of railingRuns()) {
    staticMesh(
      bayRibbon(
        a,
        b,
        D.seawall - 0.45,
        D.seawall + 0.06,
        // The top edge tucks just under the promenade so no seam shows the sea.
        (x, z, d) => (d < D.seawall - 0.3 ? groundY(x, z) - 0.05 : PROMENADE_Y - 0.01),
        () => wallCol,
        Math.ceil((b - a) / 1.2),
        1,
      ),
      track(new THREE.MeshLambertMaterial({ color: PALETTE.seawall, flatShading: true })),
    );
  }
  staticMesh(
    bayRibbon(BAY_WEST, BAY_EAST, D.seawall, D.promenadeEnd, () => PROMENADE_Y, () => lin(PALETTE.promenade), 120, 1),
    paving,
  );
  staticMesh(
    bayRibbon(BAY_WEST, BAY_EAST, D.promenadeEnd, D.rowFront + 0.5, () => PROMENADE_Y - 0.005, () => lin(PALETTE.boulevard), 120, 1),
    paving,
  );

  // Stairs down to the sand.
  const stairMat = track(new THREE.MeshLambertMaterial({ color: PALETTE.seawall }));
  for (const stair of STAIRS) {
    const n = shoreNormal(stair.x0);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const d = STAIR_BOTTOM_D + (STAIR_TOP_D - STAIR_BOTTOM_D) * t;
      const p = bayPoint(stair.x0, d);
      const h = groundY(p.x, p.z);
      const geo = new THREE.BoxGeometry(stair.halfWidth * 2 + 0.4, Math.max(0.1, h), (STAIR_TOP_D - STAIR_BOTTOM_D) / steps + 0.02);
      const m = staticMesh(geo, stairMat, { cast: false, receive: true });
      m.position.set(p.x, h / 2, p.z);
      m.rotation.y = Math.atan2(n.x, n.z);
      m.updateMatrix();
    }
    // Side walls close the opening in the sea wall on both sides of the steps.
    const run = STAIR_TOP_D - STAIR_BOTTOM_D + 0.3;
    const mid = bayPoint(stair.x0, (STAIR_TOP_D + STAIR_BOTTOM_D) / 2 + 0.1);
    for (const side of [-1, 1]) {
      const cheek = staticMesh(new THREE.BoxGeometry(0.4, PROMENADE_Y + 0.1, run), stairMat, { cast: true, receive: true });
      const off = side * (stair.halfWidth + 0.35);
      cheek.position.set(mid.x + n.z * off, (PROMENADE_Y + 0.1) / 2 - 0.05, mid.z - n.x * off);
      cheek.rotation.y = Math.atan2(n.x, n.z);
      cheek.updateMatrix();
    }
  }

  // --- Town ground -------------------------------------------------------------
  {
    const shape = new THREE.Shape();
    const pts: Array<{ x: number; z: number }> = [];
    for (let i = 0; i <= 60; i++) pts.push(bayPoint(BAY_WEST + ((BAY_EAST - BAY_WEST) * i) / 60, D.rowFront + 0.3));
    pts.push(...quayLine().slice(1));
    pts.push({ x: RIVER.west, z: -9.8 }, { x: RIVER.west, z: 90 }, { x: BAY_WEST - 30, z: 90 }, {
      x: BAY_WEST - 30,
      z: pts[0].z,
    });
    // Join the bay edge to the quay through the promenade's east end.
    pts.splice(61, 0, bayPoint(BAY_EAST, D.seawall + 0.2));
    shape.moveTo(pts[0].x, -pts[0].z);
    for (const p of pts.slice(1)) shape.lineTo(p.x, -p.z);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, PROMENADE_Y - 0.02, 0);
    staticMesh(geo, surface('paving', PALETTE.town));
  }
  // Harbour quay edge stone.
  staticMesh(
    (() => {
      const q = quayLine();
      const g = new THREE.BoxGeometry(EAST_LIMIT - q[0].x + 2, PROMENADE_Y + 0.4, 0.8);
      g.translate((EAST_LIMIT + q[0].x) / 2, (PROMENADE_Y - 0.4) / 2, -10.2);
      return g;
    })(),
    track(new THREE.MeshLambertMaterial({ color: PALETTE.seawall })),
  );
  // Old town paving, lanes and the square.
  staticMesh(flatRect(53.5, EAST_LIMIT, -9.8, SOUTH_LIMIT, PROMENADE_Y), cobbles);
  {
    const [minX, maxX] = OLDTOWN_COLS[PLAZA_CELL.col];
    const [minZ, maxZ] = OLDTOWN_ROWS[PLAZA_CELL.row];
    staticMesh(flatRect(minX - 1.5, maxX + 1.5, minZ - 1.5, maxZ + 1.5, PROMENADE_Y + 0.01), surface('paving', PALETTE.plaza));
    // Paving rings for a sense of place.
    const ring = new THREE.RingGeometry(2.2, 2.5, 32);
    ring.rotateX(-Math.PI / 2);
    ring.translate((minX + maxX) / 2, PROMENADE_Y + 0.02, (minZ + maxZ) / 2);
    staticMesh(ring, track(new THREE.MeshLambertMaterial({ color: '#d4bf9b' })));
  }
  // Alderdi Eder lawn and path.
  staticMesh(flatRect(ROW_EAST + 7, 53, -7, 9.5, PROMENADE_Y + 0.008), lawnSurface);
  staticMesh(flatRect(ROW_EAST + 7, 53.6, 2.2, 4.8, PROMENADE_Y + 0.014), surface('paving', PALETTE.boulevard));

  // --- Railing: the famous white balustrade ------------------------------------
  {
    const postGeo = track(new THREE.BoxGeometry(0.09, 1.0, 0.09));
    const curlGeo = track(new THREE.TorusGeometry(0.2, 0.025, 5, 14));
    const railMat = track(new THREE.MeshLambertMaterial({ color: PALETTE.railing }));
    const postMatrices: THREE.Matrix4[] = [];
    const curlMatrices: THREE.Matrix4[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const d = D.seawall + 0.06;
    for (const [a, b] of railingRuns()) {
      const pts: THREE.Vector3[] = [];
      for (let x0 = a; x0 <= b + 1e-6; x0 += 0.9) {
        const p = bayPoint(x0, d);
        pts.push(new THREE.Vector3(p.x, PROMENADE_Y, p.z));
        postMatrices.push(new THREE.Matrix4().makeTranslation(p.x, PROMENADE_Y + 0.5, p.z));
        // Curl between this post and the next, facing across the railing.
        const n = shoreNormal(x0 + 0.45);
        const c = bayPoint(x0 + 0.45, d);
        if (x0 + 0.45 < b) {
          q.setFromAxisAngle(up, Math.atan2(n.x, n.z));
          curlMatrices.push(m.compose(new THREE.Vector3(c.x, PROMENADE_Y + 0.48, c.z), q, new THREE.Vector3(1, 1, 1)).clone());
        }
      }
      if (pts.length < 2) continue;
      for (const h of [0.98, 0.18]) {
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(PROMENADE_Y + h)));
        const tube = new THREE.TubeGeometry(curve, Math.max(4, pts.length * 2), h > 0.5 ? 0.06 : 0.035, 5, false);
        rails.push(tube);
      }
    }
    staticMesh(mergeGeometries(rails), railMat, { cast: true, receive: false });
    rails.forEach((g) => g.dispose());
    const posts = track(new THREE.InstancedMesh(postGeo, railMat, postMatrices.length));
    postMatrices.forEach((mat, i) => posts.setMatrixAt(i, mat));
    posts.castShadow = true;
    const curls = track(new THREE.InstancedMesh(curlGeo, railMat, curlMatrices.length));
    curlMatrices.forEach((mat, i) => curls.setMatrixAt(i, mat));
    group.add(posts, curls);
  }

  // --- Street furniture -------------------------------------------------------
  const props = propLayout();
  const byKind = (k: string) => props.filter((p) => p.kind === k);
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: typeof props, yOff: number, tint?: (i: number) => THREE.Color) => {
    const mesh = track(new THREE.InstancedMesh(track(geo), mat, items.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    items.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotation);
      s.setScalar(p.scale);
      pos.set(p.x, PROMENADE_Y + yOff * p.scale, p.z);
      mesh.setMatrixAt(i, m.compose(pos, q, s));
      if (tint) mesh.setColorAt(i, tint(i));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const decor = mulberry32(77);
  {
    const contact = track(new THREE.MeshBasicMaterial({ map: track(contactTexture()), transparent: true, depthWrite: false }));
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    // Tree roots, bench feet and lamp bases stay grounded even outside the shadow map.
    const marks = instanced(geo, contact, props, 0.022);
    const dummy = new THREE.Object3D();
    props.forEach((p, i) => {
      dummy.position.set(p.x, PROMENADE_Y + 0.022, p.z);
      dummy.rotation.y = p.rotation;
      const tree = p.kind === 'tamarisk' || p.kind === 'gardenTree';
      dummy.scale.set(tree ? 2.8 : p.kind === 'bench' ? 2.2 : 0.85, 1, tree ? 2.8 : 1.1).multiplyScalar(p.scale);
      dummy.updateMatrix(); marks.setMatrixAt(i, dummy.matrix);
    });
    marks.castShadow = marks.receiveShadow = false;
  }
  const trunkMat = track(new THREE.MeshLambertMaterial({ color: '#8a6a52' }));
  const leafMat = track(applyCutaway(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })));
  for (const kind of ['tamarisk', 'gardenTree'] as const) {
    const items = byKind(kind);
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6);
    instanced(trunk, trunkMat, items, 1.1);
    const leaves = kind === 'tamarisk' ? new THREE.IcosahedronGeometry(1.6, 1) : new THREE.IcosahedronGeometry(1.5, 1);
    leaves.scale(1.15, kind === 'tamarisk' ? 0.7 : 0.95, 1.15);
    const base = kind === 'tamarisk' ? lin('#80a36c') : lin('#669555');
    instanced(leaves, leafMat, items, kind === 'tamarisk' ? 2.9 : 3.0, () =>
      base.clone().offsetHSL((decor() - 0.5) * 0.03, 0, (decor() - 0.5) * 0.08),
    );
  }
  {
    const lamps = [...byKind('lamp')];
    for (const x of [62.3, 72.3, 82.3, 92.3]) for (const z of [1.7, 11.7]) {
      lamps.push({ kind: 'lamp', x, z, rotation: Math.PI / 2, scale: 0.85 });
    }
    const poleMat = track(new THREE.MeshLambertMaterial({ color: '#3f4a4f' }));
    const parts: THREE.BufferGeometry[] = [];
    const part = (g: THREE.BufferGeometry, x: number, y: number) => { g.translate(x, y, 0); parts.push(g); };
    part(new THREE.CylinderGeometry(0.065, 0.1, 3.4, 8), 0, 1.7);
    part(new THREE.CylinderGeometry(0.18, 0.23, 0.32, 8), 0, 0.16);
    part(new THREE.SphereGeometry(0.13, 8, 6), 0, 2.8);
    for (const side of [-1, 1]) {
      const curl = new THREE.TorusGeometry(0.29, 0.045, 5, 14, Math.PI * 1.5);
      curl.rotateZ(side < 0 ? Math.PI : 0); part(curl, side * 0.28, 3.2);
      part(new THREE.ConeGeometry(0.3, 0.22, 8), side * 0.57, 3.77);
      part(new THREE.CylinderGeometry(0.28, 0.2, 0.1, 8), side * 0.57, 3.27);
      for (const dx of [-0.18, 0.18]) {
        const rod = new THREE.BoxGeometry(0.035, 0.4, 0.035); rod.translate(0, 0, 0.15);
        part(rod, side * 0.57 + dx, 3.49);
      }
    }
    const ironwork = mergeGeometries(parts); parts.forEach((p) => p.dispose());
    instanced(ironwork, poleMat, lamps, 0);
    const globes = [new THREE.SphereGeometry(0.23, 8, 6), new THREE.SphereGeometry(0.23, 8, 6)];
    globes[0].translate(-0.57, 0, 0); globes[1].translate(0.57, 0, 0);
    const lanterns = mergeGeometries(globes); globes.forEach((g) => g.dispose());
    instanced(lanterns, lampGlass, lamps, 3.5);
    const pool = new THREE.CircleGeometry(2.6, 24);
    pool.rotateX(-Math.PI / 2);
    const pools = instanced(pool, lampPools, lamps, 0.03);
    pools.castShadow = false;
    pools.receiveShadow = false;
    pools.renderOrder = 2;
  }
  {
    const benches = byKind('bench');
    const woodMat = track(new THREE.MeshLambertMaterial({ color: '#8fb3a6' }));
    const slats: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const seat = new THREE.BoxGeometry(1.75, 0.08, 0.105); seat.translate(0, 0, -0.18 + i * 0.12); slats.push(seat);
      const back = new THREE.BoxGeometry(1.75, 0.1, 0.07); back.translate(0, 0.14 + i * 0.12, -0.27); slats.push(back);
    }
    const wood = mergeGeometries(slats); slats.forEach((g) => g.dispose());
    const feet = [-0.62, 0.62].map((x) => { const g = new THREE.BoxGeometry(0.1, 0.52, 0.52); g.translate(x, -0.2, 0); return g; });
    const legs = mergeGeometries(feet); feet.forEach((g) => g.dispose());
    instanced(wood, woodMat, benches, 0.46);
    instanced(legs, track(new THREE.MeshLambertMaterial({ color: '#4a4f52' })), benches, 0.46);
  }

  // --- Hills, island, landmarks ------------------------------------------------
  const hillMat = track(new THREE.MeshLambertMaterial({ color: PALETTE.hill, flatShading: true }));
  const rockMat = track(new THREE.MeshLambertMaterial({ color: PALETTE.rock, flatShading: true }));
  const stoneMat = track(new THREE.MeshLambertMaterial({ color: '#cdbfa8', flatShading: true }));
  const whiteMat = track(new THREE.MeshLambertMaterial({ color: '#f7f4ec', flatShading: true }));
  const { urgull, igueldo, santaClara } = LANDMARKS;
  for (const [h, seed, top] of [
    [urgull, 11, SUMMITS.urgull.y],
    [igueldo, 23, SUMMITS.igueldo.y],
    [santaClara, 37, SUMMITS.santaClara.y],
  ] as const) {
    const m = staticMesh(hillGeometry(h.radius, h.height, seed, top + 0.4), hillMat, { cast: true, receive: true });
    m.position.set(h.x, -0.5, h.z);
    m.updateMatrix();
    // A rocky skirt where the hill meets the sea.
    const skirt = staticMesh(new THREE.CylinderGeometry(h.radius * 1.02, h.radius * 1.08, 2.4, 14), rockMat);
    skirt.position.set(h.x, 0.2, h.z);
    skirt.updateMatrix();
  }
  // Urgull: castle walls and the statue on top.
  {
    const top = SUMMITS.urgull.y - 0.2;
    const keep = staticMesh(new THREE.BoxGeometry(6, 2.6, 5), stoneMat, { cast: true, receive: true });
    keep.position.set(urgull.x + 1, top + 1, urgull.z - 1);
    keep.updateMatrix();
    const pedestal = staticMesh(new THREE.CylinderGeometry(0.9, 1.2, 4.5, 8), stoneMat, { cast: true, receive: true });
    pedestal.position.set(urgull.x + 1, top + 4.6, urgull.z - 1);
    pedestal.updateMatrix();
    const figure = staticMesh(new THREE.CapsuleGeometry(0.55, 2.2, 4, 8), whiteMat, { cast: true, receive: true });
    figure.position.set(urgull.x + 1, top + 8.6, urgull.z - 1);
    figure.updateMatrix();
    const arms = staticMesh(new THREE.BoxGeometry(2.6, 0.35, 0.35), whiteMat, { cast: true, receive: true });
    arms.position.set(urgull.x + 1, top + 9.0, urgull.z - 1);
    arms.updateMatrix();
  }
  // Santa Clara lighthouse.
  {
    const lh = staticMesh(new THREE.CylinderGeometry(0.7, 0.9, 3.2, 10), whiteMat, { cast: true, receive: true });
    lh.position.set(santaClara.x + 1, SUMMITS.santaClara.y + 1.6, santaClara.z);
    lh.updateMatrix();
    const cap = staticMesh(new THREE.ConeGeometry(0.9, 0.9, 10), track(new THREE.MeshLambertMaterial({ color: '#c4643f' })), { cast: true, receive: true });
    cap.position.set(santaClara.x + 1, SUMMITS.santaClara.y + 3.6, santaClara.z);
    cap.updateMatrix();
  }

  // --- Boats bobbing in the bay ------------------------------------------------
  const boats: Array<{ obj: THREE.Group; phase: number; baseY: number }> = [];
  {
    const hullColors = ['#e86f5a', '#3f78a8', '#f2c14e', '#f7f4ec', '#5aa889'];
    const spots = [
      [-30, -34],
      [-4, -40],
      [18, -36],
      [6, -26],
      [44, -18],
      [58, -17.5],
    ];
    const rng = mulberry32(5150);
    spots.forEach(([x, z], i) => {
      const boat = new THREE.Group();
      const hullGeo = new THREE.CylinderGeometry(0.8, 0.55, 0.5, 6); hullGeo.scale(0.8, 1, 2.1);
      const hull = new THREE.Mesh(track(hullGeo), track(new THREE.MeshLambertMaterial({ color: hullColors[i % hullColors.length], flatShading: true })));
      hull.position.y = 0.25;
      const cabin = new THREE.BoxGeometry(0.9, 0.6, 1); cabin.translate(0, 0.75, -0.3);
      const mast = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5); mast.translate(0, 1.6, 0.4);
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.06, 2.65, 0.4, 0.06, 0.9, 0.4, 0.06, 1.0, -1.0], 3));
      sailGeo.computeVertexNormals();
      const sail = new THREE.Mesh(track(sailGeo), track(new THREE.MeshLambertMaterial({ color: i % 2 ? '#fff1d7' : '#edc668', side: THREE.DoubleSide })));
      const stripe = new THREE.BoxGeometry(1.08, 0.09, 2.5); stripe.translate(0, 0.48, 0);
      const trim = new THREE.Mesh(track(mergeGeometries([cabin, mast, stripe])), whiteMat);
      for (const g of [cabin, mast, stripe]) g.dispose();
      boat.add(hull, trim, sail);
      hull.castShadow = true;
      boat.position.set(x, 0, z);
      boat.rotation.y = rng() * Math.PI * 2;
      group.add(boat);
      boats.push({ obj: boat, phase: rng() * Math.PI * 2, baseY: -0.05 });
    });
  }

  // --- Carousel in Alderdi Eder -------------------------------------------------
  const carousel = new THREE.Group();
  {
    const cx = CAROUSEL.x;
    const cz = CAROUSEL.z;
    const base = new THREE.Mesh(track(new THREE.CylinderGeometry(CAROUSEL.radius, CAROUSEL.radius + 0.2, 0.4, 20)), track(new THREE.MeshLambertMaterial({ color: '#f3e3c6' })));
    base.position.y = 0.2;
    const roofGeo = new THREE.ConeGeometry(CAROUSEL.radius + 0.4, 1.6, 16, 1);
    roofGeo.translate(0, 0, 0);
    {
      const nonIndexed = roofGeo.toNonIndexed();
      const colors: number[] = [];
      const a = lin('#e86f8e');
      const b = lin('#fbefdc');
      const p = nonIndexed.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const ang = Math.atan2((p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3);
        const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 16) % 2 ? a : b;
        for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
      }
      nonIndexed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const roof = new THREE.Mesh(track(nonIndexed), flatVc);
      roof.position.y = 3.6;
      roof.castShadow = true;
      carousel.add(roof);
    }
    roofGeo.dispose();
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8)), track(new THREE.MeshLambertMaterial({ color: '#f2c14e' })));
    pole.position.y = 1.9;
    carousel.add(base, pole);
    const horseColors = ['#ffffff', '#f2c14e', '#7fd6cf', '#e86f8e'];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = CAROUSEL.radius - 0.6;
      const rod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 2.8, 4)), track(new THREE.MeshLambertMaterial({ color: '#d9b25a' })));
      rod.position.set(Math.cos(ang) * r, 1.9, Math.sin(ang) * r);
      const horse = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.45, 0.85)), track(new THREE.MeshLambertMaterial({ color: horseColors[i % 4] })));
      horse.position.set(Math.cos(ang) * r, 1.2, Math.sin(ang) * r);
      horse.rotation.y = -ang;
      horse.userData.phase = ang;
      horse.castShadow = true;
      carousel.add(rod, horse);
    }
    carousel.position.set(cx, PROMENADE_Y, cz);
  }
  group.add(carousel);

  return {
    group,
    sun,
    hemi,
    sky: skyUniforms,
    lampGlass,
    lampPools,
    update(time: number) {
      skyUniforms.uTime.value = time;
      foamMat.opacity = 0.58 + Math.sin(waterTime.value * 0.8) * 0.08;
      for (const b of boats) {
        b.obj.position.y = b.baseY + Math.sin(time * 1.1 + b.phase) * 0.08;
        b.obj.rotation.z = Math.sin(time * 0.9 + b.phase) * 0.04;
        b.obj.rotation.x = Math.sin(time * 0.7 + b.phase * 1.3) * 0.03;
      }
      carousel.rotation.y = time * 0.35;
      for (const child of carousel.children) {
        if (child.userData.phase !== undefined) child.position.y = 1.2 + Math.sin(time * 2 + (child.userData.phase as number) * 2) * 0.15;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
