import * as THREE from 'three';
import { bars, TERRACE_TABLE } from '../data/restaurants.ts';
import { PROMENADE_Y } from './map.ts';
import { applyCutaway } from './materials.ts';

/**
 * Bar fronts on the old-town square (door, warm doorway, striped awning and a
 * painted sign) plus the terrace table where the crew eats together.
 */
export interface BarDressing {
  group: THREE.Group;
  /** Warm doorway glow, brighter at night. */
  doorGlow: THREE.MeshBasicMaterial;
  /** Seats around the terrace table, as positions and facing angles. */
  seats: Array<{ x: number; z: number; heading: number }>;
  dispose(): void;
}

function signTexture(name: string, colour: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf3e3';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = colour;
  g.lineWidth = 8;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#3a2c25';
  g.font = "bold 40px 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 50, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function awningTexture(colour: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#fbf3e3' : colour;
    g.fillRect(i * 16, 0, 16, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createBars(): BarDressing {
  const group = new THREE.Group();
  group.name = 'bars';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (mats.push(m), m);

  const doorGlow = mat(new THREE.MeshBasicMaterial({ color: '#ffc77a' }));
  const doorFrame = mat(new THREE.MeshLambertMaterial({ color: '#5b3a28' }));

  for (const bar of bars) {
    const front = new THREE.Group();
    // Local +Z points out of the facade, toward the square.
    front.position.set(bar.door.x - Math.sin(bar.facing) * 0.62, PROMENADE_Y, bar.door.z - Math.cos(bar.facing) * 0.62);
    front.rotation.y = bar.facing;

    const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(1.7, 2.5, 0.12)), doorFrame);
    frame.position.set(0, 1.25, 0.02);
    const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.4, 2.25)), doorGlow);
    glow.position.set(0, 1.15, 0.09);

    const stripes = awningTexture(bar.awning);
    texs.push(stripes);
    const awningMat = mat(applyCutaway(new THREE.MeshLambertMaterial({ map: stripes, side: THREE.DoubleSide }), undefined, 'cutaway-awning'));
    const awning = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 1.1)), awningMat);
    awning.position.set(0, 3.0, 0.5);
    awning.rotation.x = -0.75;
    awning.castShadow = true;

    const sign = signTexture(bar.name, bar.awning);
    texs.push(sign);
    const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.9, 0.72)), mat(new THREE.MeshLambertMaterial({ map: sign })));
    board.position.set(0, 3.75, 0.08);

    front.add(frame, glow, awning, board);
    group.add(front);
  }

  // Terrace table, four chairs and a parasol in the square.
  const wood = mat(new THREE.MeshLambertMaterial({ color: '#c99a6a' }));
  const metal = mat(new THREE.MeshLambertMaterial({ color: '#4a4f52' }));
  const cloth = mat(new THREE.MeshLambertMaterial({ color: '#fbf3e3' }));
  const tableGroup = new THREE.Group();
  tableGroup.position.set(TERRACE_TABLE.x, PROMENADE_Y, TERRACE_TABLE.z);
  const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 24)), cloth);
  top.position.y = 0.95;
  top.castShadow = true;
  top.receiveShadow = true;
  const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.12, 0.92, 8)), metal);
  leg.position.y = 0.46;
  tableGroup.add(top, leg);
  const seats: BarDressing['seats'] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.sin(a) * 1.45;
    const cz = Math.cos(a) * 1.45;
    const chair = new THREE.Group();
    chair.position.set(cx, 0, cz);
    chair.rotation.y = a + Math.PI;
    const seat = new THREE.Mesh(keep(new THREE.BoxGeometry(0.55, 0.07, 0.55)), wood);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(0.55, 0.6, 0.06)), wood);
    back.position.set(0, 0.85, -0.25);
    const legs = new THREE.Mesh(keep(new THREE.BoxGeometry(0.48, 0.55, 0.48)), metal);
    legs.position.y = 0.27;
    legs.scale.set(1, 1, 1);
    for (const m of [seat, back]) m.castShadow = true;
    chair.add(seat, back, legs);
    tableGroup.add(chair);
    seats.push({ x: TERRACE_TABLE.x + cx, z: TERRACE_TABLE.z + cz, heading: a + Math.PI });
  }
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6)), metal);
  pole.position.y = 2.2;
  const parasolTex = awningTexture('#2f7f86');
  texs.push(parasolTex);
  const parasol = new THREE.Mesh(
    keep(new THREE.ConeGeometry(1.9, 0.6, 16, 1, true)),
    mat(applyCutaway(new THREE.MeshLambertMaterial({ map: parasolTex, side: THREE.DoubleSide }), undefined, 'cutaway-parasol')),
  );
  parasol.position.y = 3.5;
  parasol.castShadow = true;
  tableGroup.add(pole, parasol);
  group.add(tableGroup);

  return {
    group,
    doorGlow,
    seats,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
