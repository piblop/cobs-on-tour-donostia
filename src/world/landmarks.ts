import * as THREE from 'three';
import {
  BASILICA_BLOCK,
  BRETXA_BLOCK,
  BRIDGE,
  GROS,
  KURSAAL,
  LANDMARKS,
  MIRAMAR,
  OLDTOWN_COLS,
  OLDTOWN_ROWS,
  PLAZA_CELL,
  PROMENADE_Y,
  RIVER,
  SUMMITS,
  ZURRIOLA,
  bayPoint,
  funicularTrack,
  hillSurface,
  peineLayout,
  travelStops,
} from './map.ts';
import { mulberry32 } from '../engine/random.ts';
import { applyCutaway, waterTime, windowGlow } from './materials.ts';
import { shoreFoamMaterial, surfaceMaterial } from './surfaces.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The wider city added in M4: Peine del Viento, the hilltops, Miramar's
 * gardens, the basilica, the market, the plaza's numbered balconies, and Gros
 * across the river with Zurriola beach and the Kursaal.
 */
export interface Landmarks {
  group: THREE.Group;
  /** The funicular car, moved by the travel scene. */
  funicularCar: THREE.Object3D;
  funicularPath: THREE.Vector3[];
  /** The little ferry to Santa Clara. */
  ferry: THREE.Object3D;
  /** Night glow for the Kursaal cubes. */
  kursaalGlow: THREE.MeshLambertMaterial;
  update(time: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createLandmarks(): Landmarks {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const M = (colour: string, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color: colour, ...extra });
    mats.push(m);
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(G(geo), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const stone = M('#d9ccb4');
  const darkStone = M('#b9ab98', { flatShading: true });
  const white = M('#fbfaf6');
  const iron = M('#4a4f52');
  const rust = M('#8a4b2a', { flatShading: true });
  const surface = (kind: Parameters<typeof surfaceMaterial>[0], color: string, vertexColors = false) => {
    const m = surfaceMaterial(kind, color, vertexColors); mats.push(m); texs.push(m.map!); return m;
  };
  const lawn = surface('grass', '#9bbf87');
  const sand = surface('sand', '#f5dfa8', true);
  const rng = mulberry32(9090);

  // --- Summit plateaus -------------------------------------------------------------
  for (const [name, top] of Object.entries(SUMMITS)) {
    const disc = mesh(new THREE.CylinderGeometry(top.r + 0.8, top.r + 1.4, 0.6, 32), name === 'urgull' ? stone : lawn, top.x, top.y - 0.3, top.z, false);
    disc.receiveShadow = true;
    // A low rim wall so the edge reads clearly.
    const rim = mesh(new THREE.TorusGeometry(top.r + 0.2, 0.18, 6, 40), stone, top.x, top.y + 0.2, top.z, false);
    rim.rotation.x = Math.PI / 2;
  }

  // --- Igueldo: the old amusement park ------------------------------------------------
  const ig = SUMMITS.igueldo;
  const wheel = new THREE.Group();
  wheel.position.set(ig.x - 3, ig.y + 4.2, ig.z - 4);
  const ring = new THREE.Mesh(G(new THREE.TorusGeometry(3.4, 0.12, 6, 32)), M('#c4513f'));
  wheel.add(ring);
  const gondolas: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(G(new THREE.BoxGeometry(0.08, 3.4, 0.08)), iron);
    spoke.rotation.z = a;
    spoke.position.set(Math.sin(a) * -1.7, Math.cos(a) * 1.7, 0);
    wheel.add(spoke);
    const g = new THREE.Mesh(G(new THREE.BoxGeometry(0.7, 0.6, 0.6)), M(['#f2c14e', '#7fd6cf', '#e86f8e', '#fbfaf6'][i % 4]));
    g.position.set(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0);
    g.castShadow = true;
    gondolas.push(g);
    wheel.add(g);
  }
  const wheelSpin = new THREE.Group();
  wheelSpin.add(wheel);
  group.add(wheelSpin);
  const legs = mesh(new THREE.BoxGeometry(0.2, 4.4, 0.2), iron, ig.x - 3, ig.y + 2.1, ig.z - 4.6);
  legs.rotation.z = 0.25;
  const legs2 = mesh(new THREE.BoxGeometry(0.2, 4.4, 0.2), iron, ig.x - 3, ig.y + 2.1, ig.z - 3.4);
  legs2.rotation.z = -0.25;
  mesh(new THREE.CylinderGeometry(1.4, 1.7, 5.5, 10), stone, ig.x - 4, ig.y + 2.75, ig.z + 5);
  mesh(new THREE.ConeGeometry(1.7, 1.3, 10), M('#c4643f'), ig.x - 4, ig.y + 6.1, ig.z + 5);
  const merry = new THREE.Group();
  merry.position.set(ig.x + 3, ig.y, ig.z + 5.5);
  merry.add(new THREE.Mesh(G(new THREE.CylinderGeometry(2.1, 2.2, 0.3, 18)), M('#f3e3c6')));
  const merryRoof = new THREE.Mesh(G(new THREE.ConeGeometry(2.4, 1.2, 12)), M('#7fd6cf'));
  merryRoof.position.y = 2.7;
  merry.add(merryRoof);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const horse = new THREE.Mesh(G(new THREE.BoxGeometry(0.25, 0.4, 0.75)), M(['#ffffff', '#f2c14e', '#e86f8e'][i % 3]));
    horse.position.set(Math.cos(a) * 1.5, 0.9, Math.sin(a) * 1.5);
    horse.rotation.y = -a;
    merry.add(horse);
  }
  group.add(merry);
  // Bunting between the attractions.
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const flag = mesh(new THREE.ConeGeometry(0.16, 0.32, 3), M(['#c4513f', '#f2c14e', '#2f7f86'][i % 3]), ig.x - 4 + t * 7, ig.y + 5 - Math.sin(t * Math.PI) * 0.8, ig.z + 5 + Math.sin(t * 3) * 0.2, false);
    flag.rotation.x = Math.PI;
  }

  // --- Funicular track, stations and car ------------------------------------------------
  const igHill = LANDMARKS.igueldo;
  const track = funicularTrack().map((p, i, arr) => {
    const t = i / (arr.length - 1);
    // The hill has random bumps up to ~10% taller and wider than its base shape; clear them.
    const surface = hillSurface({ ...igHill, radius: igHill.radius * 1.1, height: igHill.height * 1.1 }, p.x, p.z);
    const y = Math.max(PROMENADE_Y, t > 0.92 ? ig.y : surface) + 0.35;
    return new THREE.Vector3(p.x, y, p.z);
  });
  const sleeper = G(new THREE.BoxGeometry(0.2, 0.12, 1.6));
  const sleepers = new THREE.InstancedMesh(sleeper, M('#6e4a2e'), track.length * 3);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < track.length - 1; i++) {
    for (let j = 0; j < 3; j++) {
      const p = track[i].clone().lerp(track[i + 1], j / 3);
      dummy.position.copy(p);
      dummy.lookAt(track[i + 1].x, p.y, track[i + 1].z);
      dummy.rotateY(Math.PI / 2);
      dummy.updateMatrix();
      sleepers.setMatrixAt(k++, dummy.matrix);
    }
  }
  sleepers.count = k;
  group.add(sleepers);
  for (const offset of [-0.55, 0.55]) {
    const rail = new THREE.CatmullRomCurve3(track.map((p, i) => {
      const next = track[Math.min(i + 1, track.length - 1)];
      const prev = track[Math.max(i - 1, 0)];
      const dir = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
      return p.clone().add(new THREE.Vector3(-dir.z * offset, 0.1, dir.x * offset));
    }));
    mesh(new THREE.TubeGeometry(rail, 60, 0.05, 4), iron, 0, 0, 0, false);
  }
  const peine = peineLayout();
  const station = mesh(new THREE.BoxGeometry(4.4, 3.4, 3.6), M('#f1e4cc'), peine.station.x, PROMENADE_Y + 1.7, peine.station.z);
  station.rotation.y = Math.atan2(peine.tangent.x, peine.tangent.z);
  const stationRoof = mesh(new THREE.ConeGeometry(3.3, 1.4, 4), M('#c4643f'), peine.station.x, PROMENADE_Y + 4.1, peine.station.z);
  stationRoof.rotation.y = station.rotation.y + Math.PI / 4;
  mesh(new THREE.BoxGeometry(2.6, 2.4, 2.2), M('#f1e4cc'), track[track.length - 1].x + 1.6, ig.y + 1.2, track[track.length - 1].z);
  const funicularCar = new THREE.Group();
  const carBody = new THREE.Mesh(G(new THREE.BoxGeometry(1.4, 1.3, 2.6)), M('#c4513f'));
  carBody.position.y = 0.75;
  carBody.castShadow = true;
  const carRoof = new THREE.Mesh(G(new THREE.BoxGeometry(1.5, 0.15, 2.8)), white);
  carRoof.position.y = 1.5;
  const carWindows = new THREE.Mesh(G(new THREE.BoxGeometry(1.42, 0.45, 2.3)), M('#9fc6d6'));
  carWindows.position.y = 1.05;
  funicularCar.add(carBody, carRoof, carWindows);
  funicularCar.position.copy(track[0]);
  funicularCar.lookAt(track[1]);
  group.add(funicularCar);

  // --- Peine del Viento -----------------------------------------------------------------
  {
    // Walkway and platform surface.
    const shape = new THREE.Shape();
    const poly = [...peine.polyline];
    shape.moveTo(poly[0].x, -poly[0].z);
    for (const p of poly.slice(1)) shape.lineTo(p.x, -p.z);
    const floor = new THREE.ShapeGeometry(shape);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, PROMENADE_Y - 0.01, 0);
    const f = mesh(floor, M('#e8dcc4'), 0, 0, 0, false);
    f.receiveShadow = true;
    // Rocky slope inland of the walkway, rising to Igueldo.
    {
      const n = peine.inland;
      const pts = [peine.B, peine.B2, { x: peine.B2.x + n.x * 16, z: peine.B2.z + n.z * 16 }, { x: peine.B.x + n.x * 16, z: peine.B.z + n.z * 16 }];
      const slope = new THREE.Shape();
      slope.moveTo(pts[0].x, -pts[0].z);
      for (const p of pts.slice(1)) slope.lineTo(p.x, -p.z);
      const sg = new THREE.ShapeGeometry(slope);
      sg.rotateX(-Math.PI / 2);
      sg.translate(0, PROMENADE_Y - 0.03, 0);
      mesh(sg, M('#a9bf8f'), 0, 0, 0, false).receiveShadow = true;
    }
    // Platform base down to the rocks.
    mesh(new THREE.CylinderGeometry(peine.r + 0.4, peine.r + 1.2, PROMENADE_Y + 0.6, 20), darkStone, peine.C.x, (PROMENADE_Y - 0.6) / 2, peine.C.z, false);
    // Railing along the sea side.
    const seaSide = poly.slice(2, poly.length - 1).map((p) => new THREE.Vector3(p.x, PROMENADE_Y + 0.95, p.z));
    seaSide.push(new THREE.Vector3(peine.A.x, PROMENADE_Y + 0.95, peine.A.z));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seaSide), 60, 0.06, 5), M('#fbfbf7'), 0, 0, 0, false);
    // The three combs: curling iron claws on rocks in the surf.
    peine.sculptures.forEach((p, i) => {
      const rock = mesh(new THREE.DodecahedronGeometry(1.6 + i * 0.3, 0), darkStone, p.x, 0.2, p.z, false);
      rock.scale.y = 0.6;
      const comb = new THREE.Group();
      comb.position.set(p.x, 0.9, p.z);
      comb.rotation.y = rng() * Math.PI * 2;
      const post = new THREE.Mesh(G(new THREE.BoxGeometry(0.45, 1.6, 0.45)), rust);
      post.position.y = 0.8;
      comb.add(post);
      for (let j = 0; j < 3; j++) {
        const claw = new THREE.Mesh(G(new THREE.TorusGeometry(0.85, 0.16, 6, 10, Math.PI * 0.75)), rust);
        claw.position.set(0, 1.5, 0);
        claw.rotation.set(Math.PI / 2, (j / 3) * Math.PI * 2, 0.3);
        claw.castShadow = true;
        comb.add(claw);
      }
      group.add(comb);
    });
  }
  // Spray that bursts up through the rocks now and then.
  const sprayGeo = G(new THREE.IcosahedronGeometry(0.16, 1));
  const sprayMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false });
  mats.push(sprayMat);
  const spray = new THREE.InstancedMesh(sprayGeo, sprayMat, 36);
  spray.frustumCulled = false;
  group.add(spray);
  const sprayBits = Array.from({ length: 36 }, (_, i) => ({
    origin: peine.sculptures[i % 3],
    vx: (rng() - 0.5) * 3,
    vz: (rng() - 0.5) * 3,
    vy: 5 + rng() * 4,
    phase: rng(),
  }));

  // --- Miramar gardens ------------------------------------------------------------------
  {
    const pts: THREE.Vector3[] = [];
    const idx: number[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const x0 = MIRAMAR.from + ((MIRAMAR.to - MIRAMAR.from) * i) / steps;
      const a = bayPoint(x0, 19.6);
      const b = bayPoint(x0, MIRAMAR.depth);
      pts.push(new THREE.Vector3(a.x, PROMENADE_Y + 0.01, a.z), new THREE.Vector3(b.x, PROMENADE_Y + 0.01, b.z));
      if (i < steps) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setIndex(idx);
    g.computeVertexNormals();
    const lawnMesh = mesh(g, lawn, 0, 0, 0, false);
    lawnMesh.receiveShadow = true;
    // Hedges along the sides and flower beds by the path.
    for (const x0 of [MIRAMAR.from + 0.6, MIRAMAR.to - 0.6]) {
      const a = bayPoint(x0, 21);
      const b = bayPoint(x0, MIRAMAR.depth - 1);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const hedge = mesh(new THREE.BoxGeometry(0.9, 1.1, len), M('#5f8a4a', { flatShading: true }), (a.x + b.x) / 2, PROMENADE_Y + 0.55, (a.z + b.z) / 2);
      hedge.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }
    const flowers = ['#e86f8e', '#f2c14e', '#fbfaf6', '#b98be0'];
    for (let i = 0; i < 18; i++) {
      const x0 = MIRAMAR.from + 2 + rng() * (MIRAMAR.to - MIRAMAR.from - 4);
      const p = bayPoint(x0, 21.5 + rng() * 3.5);
      mesh(new THREE.SphereGeometry(0.28, 6, 5), M(flowers[i % flowers.length]), p.x, PROMENADE_Y + 0.25, p.z, false);
    }
  }

  // --- Basilica facade details ------------------------------------------------------------
  {
    const bx = (BASILICA_BLOCK.minX + BASILICA_BLOCK.maxX) / 2;
    const fz = BASILICA_BLOCK.maxZ - 1.1;
    const portal = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 18, 1, false, 0, Math.PI), M('#5b3a28'), bx, PROMENADE_Y + 2.6, fz + 0.62, false);
    portal.rotation.x = Math.PI / 2;
    portal.rotation.z = Math.PI;
    mesh(new THREE.BoxGeometry(2.2, 2.6, 0.2), M('#5b3a28'), bx, PROMENADE_Y + 1.3, fz + 0.62, false);
    const rose = mesh(new THREE.TorusGeometry(0.7, 0.14, 6, 18), M('#c9b48c'), bx, PROMENADE_Y + 7.4, fz + 0.66, false);
    rose.rotation.y = 0;
    mesh(new THREE.CircleGeometry(0.6, 18), M('#7aa3bd'), bx, PROMENADE_Y + 7.4, fz + 0.68, false);
    // Ornate top of the facade.
    mesh(new THREE.ConeGeometry(1.6, 1.8, 4), stone, bx, PROMENADE_Y + 13.3, fz + 0.4).rotation.y = Math.PI / 4;
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(5.2 - i * 0.6, 0.25, 0.4), stone, bx, PROMENADE_Y + 0.12 + i * 0.25, fz + 1.2 + i * -0.35, false);
  }

  // --- Mercado de la Bretxa: arches and stalls --------------------------------------------
  {
    const mx = (BRETXA_BLOCK.minX + BRETXA_BLOCK.maxX) / 2;
    const fz = BRETXA_BLOCK.minZ + 0.2;
    for (let i = -1; i <= 1; i++) {
      const arch = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16, 1, false, 0, Math.PI), M('#5f8a7a'), mx + i * 2.1, PROMENADE_Y + 3.4, fz - 0.06, false);
      arch.rotation.x = -Math.PI / 2;
      mesh(new THREE.BoxGeometry(1.7, 2.6, 0.1), M('#3f5f55'), mx + i * 2.1, PROMENADE_Y + 2.0, fz - 0.06, false);
    }
    const stallColours = ['#2f7f86', '#c4513f', '#f2c14e'];
    for (let i = 0; i < 3; i++) {
      const sx = mx - 2.4 + i * 2.4;
      mesh(new THREE.BoxGeometry(1.8, 0.9, 0.9), M('#b98a5a'), sx, PROMENADE_Y + 0.45, fz - 1.6);
      const canopy = mesh(new THREE.BoxGeometry(2, 0.1, 1.2), M(stallColours[i]), sx, PROMENADE_Y + 2.1, fz - 1.6);
      canopy.rotation.x = 0.2;
      for (let j = 0; j < 5; j++) mesh(new THREE.SphereGeometry(0.12, 6, 5), M(['#d8432f', '#5f8a3a', '#f2c45a', '#9aa7ad'][(i + j) % 4]), sx - 0.6 + j * 0.3, PROMENADE_Y + 0.98, fz - 1.6, false);
    }
  }

  // --- Plaza de la Constitucion: numbered balconies ----------------------------------------
  {
    const atlas = document.createElement('canvas');
    atlas.width = 512;
    atlas.height = 256;
    const g = atlas.getContext('2d')!;
    for (let n = 0; n < 32; n++) {
      const cx = (n % 8) * 64;
      const cy = Math.floor(n / 8) * 64;
      g.fillStyle = '#fbf6ec';
      g.fillRect(cx + 4, cy + 10, 56, 44);
      g.strokeStyle = '#3a2c25';
      g.lineWidth = 3;
      g.strokeRect(cx + 4, cy + 10, 56, 44);
      g.fillStyle = '#3a2c25';
      g.font = 'bold 30px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n + 1), cx + 32, cy + 33);
    }
    const tex = new THREE.CanvasTexture(atlas);
    tex.colorSpace = THREE.SRGBColorSpace;
    texs.push(tex);
    const [pMinX, pMaxX] = OLDTOWN_COLS[PLAZA_CELL.col];
    const [pMinZ, pMaxZ] = OLDTOWN_ROWS[PLAZA_CELL.row];
    // Faces of the blocks that look onto the square (lanes are 3 wide).
    const faces = [
      { x0: pMinX - 0.5, z0: pMinZ - 3 + 0.08, dirX: 1, dirZ: 0, nx: 0, nz: 1 },
      { x0: pMinX - 0.5, z0: pMaxZ + 3 - 0.08, dirX: 1, dirZ: 0, nx: 0, nz: -1 },
      { x0: pMinX - 3 + 0.08, z0: pMinZ - 0.5, dirX: 0, dirZ: 1, nx: 1, nz: 0 },
      { x0: pMaxX + 3 - 0.08, z0: pMinZ - 0.5, dirX: 0, dirZ: 1, nx: -1, nz: 0 },
    ];
    const pos: number[] = [];
    const uv: number[] = [];
    let n = 0;
    for (const f of faces) {
      for (const floorY of [PROMENADE_Y + 5.1, PROMENADE_Y + 8.2]) {
        for (let i = 0; i < 4 && n < 32; i++, n++) {
          const along = 0.9 + i * 1.95;
          const cx = f.x0 + f.dirX * along + f.nx * 0.02;
          const cz = f.z0 + f.dirZ * along + f.nz * 0.02;
          const hw = 0.32;
          const hh = 0.26;
          const corners = [
            [-hw, -hh],
            [hw, -hh],
            [hw, hh],
            [-hw, hh],
          ].map(([a, b]) => [cx + f.dirX * a, floorY + b, cz + f.dirZ * a]);
          const u0 = (n % 8) / 8;
          const v0 = 1 - (Math.floor(n / 8) + 1) / 4;
          const uvs = [
            [u0, v0],
            [u0 + 1 / 8, v0],
            [u0 + 1 / 8, v0 + 1 / 4],
            [u0, v0 + 1 / 4],
          ];
          for (const t of [0, 1, 2, 0, 2, 3]) {
            pos.push(...corners[t]);
            uv.push(...uvs[t]);
          }
        }
      }
    }
    const plates = new THREE.BufferGeometry();
    plates.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    plates.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    plates.computeVertexNormals();
    const plateMesh = new THREE.Mesh(G(plates), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    mats.push(plateMesh.material as THREE.Material);
    group.add(plateMesh);
  }

  // --- River, bridge and Gros ------------------------------------------------------------------
  for (const x of [RIVER.west, RIVER.east]) {
    mesh(new THREE.BoxGeometry(0.8, PROMENADE_Y + 0.5, 60), stone, x + (x === RIVER.west ? -0.4 : 0.4), (PROMENADE_Y - 0.5) / 2, 0, false);
  }
  const deck = mesh(new THREE.BoxGeometry(RIVER.east - RIVER.west + 2, 0.5, BRIDGE.maxZ - BRIDGE.minZ), stone, (RIVER.west + RIVER.east) / 2, PROMENADE_Y - 0.25, (BRIDGE.minZ + BRIDGE.maxZ) / 2);
  deck.receiveShadow = true;
  for (const z of [BRIDGE.minZ + 0.1, BRIDGE.maxZ - 0.1]) {
    mesh(new THREE.BoxGeometry(RIVER.east - RIVER.west + 2, 0.12, 0.12), M('#fbfbf7'), (RIVER.west + RIVER.east) / 2, PROMENADE_Y + 0.95, z, false);
    for (let x = RIVER.west - 0.8; x <= RIVER.east + 0.9; x += 1.2) mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), M('#fbfbf7'), x, PROMENADE_Y + 0.47, z, false);
  }
  const grosGround = new THREE.PlaneGeometry(GROS.maxX - RIVER.east + 40, GROS.maxZ - ZURRIOLA.wallZ + 60);
  grosGround.rotateX(-Math.PI / 2);
  grosGround.translate((RIVER.east + GROS.maxX + 40) / 2, PROMENADE_Y - 0.02, (ZURRIOLA.wallZ + GROS.maxZ + 60) / 2);
  mesh(grosGround, surface('paving', '#d9d7cd'), 0, 0, 0, false).receiveShadow = true;
  // Zurriola beach, sloping down to the open sea.
  {
    const w = GROS.maxX - RIVER.east + 40;
    const g = new THREE.PlaneGeometry(w, ZURRIOLA.wallZ - ZURRIOLA.waterZ + 4, 4, 8);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const dry = new THREE.Color('#ffffff'), wet = new THREE.Color('#958b76');
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) + (ZURRIOLA.wallZ + ZURRIOLA.waterZ - 4) / 2;
      p.setY(i, 0.05 + 0.034 * Math.max(-1, z - ZURRIOLA.waterZ) - (z < ZURRIOLA.waterZ ? 0.3 : 0));
      const color = wet.clone().lerp(dry, THREE.MathUtils.smoothstep(z, ZURRIOLA.waterZ, ZURRIOLA.waterZ + 4));
      colors.push(color.r, color.g, color.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    mesh(g, sand, RIVER.east + w / 2, 0, (ZURRIOLA.wallZ + ZURRIOLA.waterZ - 4) / 2, false).receiveShadow = true;
    const foam = shoreFoamMaterial(); mats.push(foam); texs.push(foam.map!);
    const lace = new THREE.PlaneGeometry(w, 1.2); lace.rotateX(-Math.PI / 2);
    mesh(lace, foam, RIVER.east + w / 2, 0.08, ZURRIOLA.waterZ - 0.15, false).renderOrder = 1;
    // Sea wall and railing, open at the ramp.
    for (const [a, b] of [
      [RIVER.east, ZURRIOLA.ramp[0]],
      [ZURRIOLA.ramp[1], GROS.maxX + 40],
    ] as const) {
      mesh(new THREE.BoxGeometry(b - a, 1, 0.5), stone, (a + b) / 2, PROMENADE_Y - 0.5, ZURRIOLA.wallZ - 0.25, false);
      mesh(new THREE.BoxGeometry(b - a, 0.1, 0.1), M('#fbfbf7'), (a + b) / 2, PROMENADE_Y + 0.95, ZURRIOLA.wallZ - 0.1, false);
    }
    const ramp = mesh(new THREE.BoxGeometry(ZURRIOLA.ramp[1] - ZURRIOLA.ramp[0], 0.3, 4.3), stone, (ZURRIOLA.ramp[0] + ZURRIOLA.ramp[1]) / 2, 1.05, ZURRIOLA.wallZ - 2, false);
    ramp.rotation.x = -0.17;
  }
  // The Kursaal: two leaning glass cubes that glow at night.
  const glassCanvas = document.createElement('canvas'); glassCanvas.width = glassCanvas.height = 128;
  const gg = glassCanvas.getContext('2d')!;
  const sheen = gg.createLinearGradient(0, 0, 128, 80);
  sheen.addColorStop(0, '#c4e1dd'); sheen.addColorStop(0.4, '#f1eee0'); sheen.addColorStop(0.6, '#b6d3d9'); sheen.addColorStop(1, '#d6e5d9');
  gg.fillStyle = sheen; gg.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    gg.fillStyle = 'rgba(247,255,246,0.28)'; gg.fillRect(x, 0, 2, 128);
    gg.fillStyle = 'rgba(29,86,102,0.1)'; gg.fillRect(x + 6, 0, 1, 128);
  }
  const glassMap = new THREE.CanvasTexture(glassCanvas); glassMap.colorSpace = THREE.SRGBColorSpace; texs.push(glassMap);
  const kursaalGlow = applyCutaway(M('#ffffff', { map: glassMap, transparent: true, opacity: 0.86, emissive: '#ffe7b8', emissiveIntensity: 0 }), (shader) => {
    shader.uniforms.uWindowGlow = windowGlow;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlassWorld;\nvarying vec3 vGlassNormal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGlassNormal = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWindowGlow;\nvarying vec3 vGlassWorld;\nvarying vec3 vGlassNormal;').replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float rim = pow(1.0 - abs(dot(normalize(cameraPosition - vGlassWorld), normalize(vGlassNormal))), 3.0);
      totalEmissiveRadiance += vec3(0.4, 0.65, 0.7) * rim * 0.3;
      totalEmissiveRadiance += vec3(1.5, 1.2, 0.65) * uWindowGlow * texture2D(map, vMapUv).rgb;
    `);
  }, 'cutaway-kursaal');
  const ribs: THREE.BufferGeometry[] = [];
  for (const k of KURSAAL) {
    const cube = mesh(new THREE.BoxGeometry(k.w, k.h, k.d), kursaalGlow, k.x, PROMENADE_Y + k.h / 2, k.z);
    cube.rotation.z = 0.04;
    cube.updateMatrix();
    const rib = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.applyMatrix4(cube.matrix); ribs.push(g);
    };
    for (const side of [-1, 1]) {
      for (let x = -k.w / 2; x <= k.w / 2 + 0.01; x += k.w / 12) rib(0.045, k.h, 0.065, x, 0, side * (k.d / 2 + 0.02));
      for (let z = -k.d / 2; z <= k.d / 2 + 0.01; z += k.d / 12) rib(0.065, k.h, 0.045, side * (k.w / 2 + 0.02), 0, z);
      for (const y of [-k.h / 2, 0, k.h / 2]) {
        rib(k.w + 0.1, 0.075, 0.1, 0, y, side * k.d / 2);
        rib(0.1, 0.075, k.d, side * k.w / 2, y, 0);
      }
    }
  }
  mesh(mergeGeometries(ribs), applyCutaway(M('#c3d6ce'), undefined, 'cutaway-kursaal-ribs'), 0, 0, 0, false);
  ribs.forEach((g) => g.dispose());

  // Festooned lane crossings, with a sagging wire and little Basque-colour pennants.
  {
    const pos: number[] = [], colors: number[] = [];
    const wires: number[] = [];
    const shades = ['#ba4947', '#f6e6c6', '#3a8272', '#e4af50'];
    for (const x of [58, 68.5, 78.5, 88.5]) for (const z of [3.5, 13.5]) {
      const wire = (t: number) => new THREE.Vector3(x, PROMENADE_Y + 6.2 - Math.sin(t * Math.PI) * 0.45, z - 1.9 + t * 3.8);
      for (let i = 0; i < 16; i++) wires.push(...wire(i / 16).toArray(), ...wire((i + 1) / 16).toArray());
      for (let i = 0; i < 7; i++) {
        const a = wire((i + 0.15) / 7), b = wire((i + 0.85) / 7);
        const tip = a.clone().lerp(b, 0.5); tip.y -= 0.52; tip.x += 0.1;
        pos.push(...a.toArray(), ...b.toArray(), ...tip.toArray());
        const color = new THREE.Color(shades[(i + Math.floor(x)) % shades.length]);
        for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
      }
    }
    const flags = new THREE.BufferGeometry();
    flags.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    flags.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); flags.computeVertexNormals();
    mesh(flags, applyCutaway(M('#ffffff', { vertexColors: true, side: THREE.DoubleSide })), 0, 0, 0, false);
    const wireGeo = G(new THREE.BufferGeometry()); wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const wireMat = applyCutaway(new THREE.LineBasicMaterial({ color: '#515d59' })); mats.push(wireMat);
    group.add(new THREE.LineSegments(wireGeo, wireMat));
  }
  // Surfers waiting for a wave off Zurriola.
  const surfers: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group();
    const board = new THREE.Mesh(G(new THREE.BoxGeometry(0.4, 0.08, 1.8)), M(['#f2c14e', '#fbfaf6', '#e86f8e'][i % 3]));
    const body = new THREE.Mesh(G(new THREE.CapsuleGeometry(0.2, 0.5, 3, 6)), M('#2b2b30'));
    body.position.y = 0.45;
    const head = new THREE.Mesh(G(new THREE.SphereGeometry(0.18, 8, 6)), M('#e8b48f'));
    head.position.y = 0.95;
    s.add(board, body, head);
    s.position.set(114 + i * 6 + rng() * 3, 0, ZURRIOLA.waterZ - 6 - rng() * 8);
    s.rotation.y = Math.PI + (rng() - 0.5) * 0.6;
    s.userData.phase = rng() * 6;
    surfers.push(s);
    group.add(s);
  }

  // --- Santa Clara jetty, the ferry, Urgull path and the taxi rank --------------------------------
  const stops = travelStops();
  const sc = SUMMITS.santaClara;
  mesh(new THREE.BoxGeometry(1.4, 0.3, 4), M('#8a6a52'), sc.x + 3.5, 0.6, sc.z + 3.5, false);
  const ferry = new THREE.Group();
  const hull = new THREE.Mesh(G(new THREE.BoxGeometry(1.8, 0.7, 4.2)), M('#2f7f86'));
  hull.position.y = 0.35;
  hull.castShadow = true;
  const cabin = new THREE.Mesh(G(new THREE.BoxGeometry(1.4, 0.8, 1.6)), white);
  cabin.position.set(0, 1.1, -0.6);
  ferry.add(hull, cabin);
  ferry.position.set(stops.boatQuay.x, -0.05, stops.boatQuay.z - 3);
  group.add(ferry);
  // Steps up Monte Urgull from the end of the quay.
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(2.4, 0.3, 0.6), stone, stops.urgullFoot.x + 1.4, PROMENADE_Y + 0.15 + i * 0.3, stops.urgullFoot.z - 1.2 - i * 0.6, false);
  // Taxi rank sign in Alderdi Eder.
  mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), iron, stops.taxiRank.x, PROMENADE_Y + 1.3, stops.taxiRank.z + 1.1);
  const taxiSign = document.createElement('canvas');
  taxiSign.width = 128;
  taxiSign.height = 64;
  const tg = taxiSign.getContext('2d')!;
  tg.fillStyle = '#f2c14e';
  tg.fillRect(0, 0, 128, 64);
  tg.fillStyle = '#2b211d';
  tg.font = 'bold 30px system-ui, sans-serif';
  tg.textAlign = 'center';
  tg.textBaseline = 'middle';
  tg.fillText('TAXI', 64, 34);
  const taxiTex = new THREE.CanvasTexture(taxiSign);
  taxiTex.colorSpace = THREE.SRGBColorSpace;
  texs.push(taxiTex);
  const signMesh = mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshLambertMaterial({ map: taxiTex, side: THREE.DoubleSide }), stops.taxiRank.x, PROMENADE_Y + 2.7, stops.taxiRank.z + 1.1, false);
  mats.push(signMesh.material as THREE.Material);

  const tmp = new THREE.Object3D();
  return {
    group,
    funicularCar,
    funicularPath: track,
    ferry,
    kursaalGlow,
    update(time, reducedMotion) {
      waterTime.value = reducedMotion ? 0 : time;
      if (!reducedMotion) {
        wheel.rotation.z = time * 0.25;
        for (const g of gondolas) g.rotation.z = -wheel.rotation.z;
        merry.rotation.y = time * 0.4;
      }
      for (const s of surfers) {
        s.position.y = Math.sin(time * 1.2 + (s.userData.phase as number)) * 0.12;
        s.rotation.z = Math.sin(time * 0.9 + (s.userData.phase as number)) * 0.06;
      }
      // Bursts every few seconds, staggered across the three combs.
      sprayBits.forEach((b, i) => {
        const cycle = (time * 0.33 + b.phase * 0.15 + (i % 3) * 0.33) % 1;
        const t = cycle * 1.6;
        const alive = !reducedMotion && t < 1.3;
        tmp.position.set(b.origin.x + b.vx * t, alive ? 0.6 + b.vy * t - 4.9 * t * t : -10, b.origin.z + b.vz * t);
        tmp.scale.setScalar(alive ? Math.max(0.05, 1 - t / 1.3) : 0.01);
        tmp.updateMatrix();
        spray.setMatrixAt(i, tmp.matrix);
      });
      spray.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      spray.dispose();
      sleepers.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
