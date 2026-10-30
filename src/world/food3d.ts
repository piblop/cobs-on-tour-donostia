import * as THREE from 'three';
import type { FoodDef } from '../data/types.ts';

/**
 * Original stylised food models built from primitives: chunky, readable and
 * a little cartoonish, on white plates. Plus gentle procedural steam.
 */
export interface Dish {
  group: THREE.Group;
  steam: THREE.Mesh[];
  dispose(): void;
}

export function makeDish(food: FoodDef): Dish {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => (geos.push(x), x);
  const m = (colour: string, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const mat = new THREE.MeshLambertMaterial({ color: colour, ...extra });
    mats.push(mat);
    return mat;
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(g(geo), mat);
    mesh.position.set(x, y, z);
    // Only the plate and big pieces cast shadows; tiny ingredients would be invisible cost.
    geo.computeBoundingSphere();
    mesh.castShadow = (geo.boundingSphere?.radius ?? 0) > 0.12;
    group.add(mesh);
    return mesh;
  };
  const c = food.colours;
  const white = m('#fbfaf6');
  const bread = m('#e2b77a');

  if (food.model !== 'drink') add(new THREE.CylinderGeometry(0.34, 0.28, 0.05, 24), white, 0, 0.025, 0);

  switch (food.model) {
    case 'gilda': {
      const stick = add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), m('#d9c19a'), 0, 0.12, 0);
      stick.rotation.z = Math.PI / 2.4;
      for (const [i, col] of [c.base, c.accent, c.topping, c.base].entries()) {
        const bit = add(new THREE.SphereGeometry(0.06, 10, 8), m(col), -0.14 + i * 0.09, 0.08 + i * 0.035, 0);
        bit.scale.set(1.3, 0.9, 0.9);
      }
      break;
    }
    case 'mushroom': {
      add(new THREE.BoxGeometry(0.4, 0.06, 0.24), bread, 0, 0.08, 0);
      for (let i = 0; i < 5; i++) {
        const cap = add(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(c.base), -0.13 + i * 0.065, 0.11, (i % 2) * 0.05 - 0.02);
        cap.scale.y = 0.7;
      }
      const yolk = add(new THREE.SphereGeometry(0.07, 12, 8), m(c.topping, { emissive: '#3a2a00' }), 0, 0.16, 0);
      yolk.scale.y = 0.6;
      break;
    }
    case 'clams': {
      const bowl = add(new THREE.CylinderGeometry(0.3, 0.2, 0.14, 20, 1, true), m('#c9572f', { side: THREE.DoubleSide }), 0, 0.1, 0);
      bowl.castShadow = false;
      add(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20), m(c.topping), 0, 0.14, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const shell = add(new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI), m(c.base), Math.cos(a) * 0.14, 0.16, Math.sin(a) * 0.14);
        shell.rotation.set(-0.6, a, 0);
      }
      break;
    }
    case 'cheek': {
      add(new THREE.BoxGeometry(0.4, 0.05, 0.26), bread, 0, 0.07, 0);
      const meat = add(new THREE.SphereGeometry(0.13, 12, 8), m(c.base), 0, 0.15, 0);
      meat.scale.set(1.4, 0.7, 1);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 16), m(c.topping), 0, 0.105, 0);
      break;
    }
    case 'anchovy': {
      add(new THREE.BoxGeometry(0.44, 0.06, 0.2), bread, 0, 0.08, 0);
      for (let i = 0; i < 3; i++) {
        const fish = add(new THREE.CapsuleGeometry(0.025, 0.3, 3, 6), m(c.topping), 0, 0.125, -0.06 + i * 0.06);
        fish.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'peppers': {
      for (let i = 0; i < 7; i++) {
        const p = add(new THREE.CapsuleGeometry(0.035, 0.14, 3, 6), m(i % 3 ? c.base : c.topping), Math.cos(i * 2.1) * 0.13, 0.08, Math.sin(i * 2.1) * 0.13);
        p.rotation.set(Math.PI / 2, 0, i * 0.9);
      }
      break;
    }
    case 'tomato-salad': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const slice = add(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 14), m(c.base), Math.cos(a) * 0.14, 0.07 + i * 0.006, Math.sin(a) * 0.14);
        slice.rotation.x = 0.08;
      }
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.006, 16), m(c.topping, { transparent: true, opacity: 0.6 }), 0, 0.1, 0);
      break;
    }
    case 'txuleta': {
      const board = add(new THREE.BoxGeometry(0.62, 0.05, 0.4), m('#8a5a32'), 0, 0.05, 0);
      board.receiveShadow = true;
      for (let i = 0; i < 5; i++) {
        const slice = add(new THREE.BoxGeometry(0.08, 0.07, 0.24), m(i % 2 ? c.base : c.topping), -0.18 + i * 0.09, 0.11, 0);
        slice.rotation.z = 0.15;
      }
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), m(c.accent), 0.22, 0.1, 0.1).rotation.x = Math.PI / 2;
      break;
    }
    case 'tortilla': {
      const wedge = add(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 20, 1, false, 0, Math.PI / 2.6), m(c.base), 0, 0.13, 0);
      wedge.rotation.y = -0.5;
      add(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 20, 1, false, 0, Math.PI / 2.6), m(c.topping), 0, 0.215, 0).rotation.y = -0.5;
      break;
    }
    case 'cheesecake': {
      const wedge = add(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 24, 1, false, 0, Math.PI / 3), m(c.base), 0, 0.15, 0);
      wedge.rotation.y = -0.5;
      const top = add(new THREE.CylinderGeometry(0.265, 0.265, 0.03, 24, 1, false, 0, Math.PI / 3), m(c.topping), 0, 0.26, 0);
      top.rotation.y = -0.5;
      break;
    }
    case 'drink': {
      const glass = add(new THREE.CylinderGeometry(0.09, 0.07, 0.3, 14, 1, true), m('#e8f4f2', { transparent: true, opacity: 0.45, side: THREE.DoubleSide }), 0, 0.15, 0);
      glass.castShadow = false;
      add(new THREE.CylinderGeometry(0.083, 0.07, 0.2, 14), m(c.base, { transparent: true, opacity: 0.85 }), 0, 0.11, 0);
      break;
    }
  }

  // Gentle steam for hot dishes: a few soft puffs that rise and fade.
  const steam: THREE.Mesh[] = [];
  const hot = ['mushroom', 'clams', 'cheek', 'txuleta', 'peppers', 'tortilla'].includes(food.model);
  if (hot) {
    const puff = g(new THREE.SphereGeometry(0.06, 8, 6));
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      mats.push(mat);
      const s = new THREE.Mesh(puff, mat);
      s.userData.phase = i / 2;
      group.add(s);
      steam.push(s);
    }
  }

  return {
    group,
    steam,
    dispose() {
      group.removeFromParent();
      for (const x of geos) x.dispose();
      for (const x of mats) x.dispose();
    },
  };
}

const thumbCache = new Map<string, string>();
let thumbRenderer: THREE.WebGLRenderer | null = null;

/**
 * A small rendered picture of a dish for menus and the tray, made once per
 * food with one shared offscreen renderer and cached as a data URL.
 */
export function foodThumbnail(food: FoodDef): string {
  const cached = thumbCache.get(food.id);
  if (cached) return cached;
  try {
    if (!thumbRenderer) {
      thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbRenderer.setSize(160, 120, false);
      thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      thumbRenderer.toneMapping = THREE.NeutralToneMapping;
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0xe8d8c4, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 3, 2);
    scene.add(key);
    const dish = makeDish(food);
    scene.add(dish.group);
    const cam = new THREE.PerspectiveCamera(30, 160 / 120, 0.05, 20);
    cam.position.set(0, 0.95, 1.1);
    cam.lookAt(0, 0.1, 0);
    thumbRenderer.setClearColor(0xfbf3e3, 1);
    thumbRenderer.render(scene, cam);
    const url = thumbRenderer.domElement.toDataURL('image/png');
    dish.dispose();
    thumbCache.set(food.id, url);
    return url;
  } catch {
    return '';
  }
}

/** Animate steam puffs for a dish. */
export function animateSteam(d: Dish, time: number, reducedMotion: boolean): void {
  for (const s of d.steam) {
    const p = (time * 0.35 + (s.userData.phase as number)) % 1;
    s.position.set(Math.sin(p * 9 + (s.userData.phase as number) * 6) * 0.05, 0.2 + p * 0.55, 0);
    s.scale.setScalar(0.6 + p * 1.2);
    (s.material as THREE.MeshBasicMaterial).opacity = (reducedMotion ? 0.25 : 0.4) * Math.sin(p * Math.PI);
  }
}
