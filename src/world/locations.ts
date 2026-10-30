import * as THREE from 'three';
import { areas, locations } from '../data/locations.ts';
import type { Area, LocationDef } from '../data/types.ts';
import { groundY, propLayout, type Prop } from './map.ts';

/** Anything the crew can use: a discovery, or a bench to sit on together. */
export type Spot =
  | { kind: 'discovery'; id: string; x: number; z: number; radius: number; label: string; loc: LocationDef }
  | { kind: 'bench'; id: string; x: number; z: number; radius: number; label: string; bench: Prop };

/**
 * Usable spots in the world. Discoveries have a soft glowing ring and a
 * sparkle; benches only show a ring when they are the nearest usable thing,
 * so the map never fills up with icons.
 */
export class Interactables {
  readonly group = new THREE.Group();
  readonly spots: Spot[] = [];
  private rings = new Map<string, { ring: THREE.Mesh; sparkle: THREE.Mesh | null; y: number; kind: Spot['kind'] }>();
  private ringGeo = new THREE.RingGeometry(0.75, 0.95, 40);
  private sparkleGeo = new THREE.OctahedronGeometry(0.16, 0);
  private ringMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.55, depthWrite: false });
  private ringActiveMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.95, depthWrite: false });
  private sparkleMat = new THREE.MeshBasicMaterial({ color: '#fff6d8' });
  private active: string | null = null;

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2);
    for (const loc of locations) {
      this.add({ kind: 'discovery', id: loc.id, x: loc.position.x, z: loc.position.z, radius: loc.interactRadius, label: loc.actionLabel, loc });
    }
    propLayout()
      .filter((p) => p.kind === 'bench')
      .forEach((bench, i) => {
        // The usable point sits just behind the bench (the front faces the railing).
        const x = bench.x - Math.sin(bench.rotation) * 1.2;
        const z = bench.z - Math.cos(bench.rotation) * 1.2;
        this.add({ kind: 'bench', id: `bench-${i}`, x, z, radius: 1.6, label: 'Sit together', bench });
      });
  }

  private add(spot: Spot): void {
    this.spots.push(spot);
    const y = groundY(spot.x, spot.z) + 0.03;
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.position.set(spot.x, y, spot.z);
    ring.renderOrder = 2;
    let sparkle: THREE.Mesh | null = null;
    if (spot.kind === 'discovery') {
      sparkle = new THREE.Mesh(this.sparkleGeo, this.sparkleMat);
      sparkle.position.set(spot.x, y + 2.4, spot.z);
      this.group.add(sparkle);
    } else {
      ring.visible = false;
      ring.scale.setScalar(0.8);
    }
    this.group.add(ring);
    this.rings.set(spot.id, { ring, sparkle, y, kind: spot.kind });
  }

  /** The closest spot within its radius, if any. Discoveries win ties. */
  nearest(x: number, z: number): Spot | null {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - x, s.z - z) - (s.kind === 'discovery' ? 0.5 : 0);
      if (d <= s.radius && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  setActive(id: string | null): void {
    if (id === this.active) return;
    if (this.active) {
      const r = this.rings.get(this.active)!;
      r.ring.material = this.ringMat;
      if (r.kind === 'bench') r.ring.visible = false;
    }
    this.active = id;
    if (id) {
      const r = this.rings.get(id)!;
      r.ring.material = this.ringActiveMat;
      r.ring.visible = true;
    }
  }

  promptAnchor(id: string, out: THREE.Vector3): THREE.Vector3 {
    const r = this.rings.get(id)!;
    return out.copy(r.ring.position).setY(r.y + 2.9);
  }

  markDiscovered(id: string): void {
    const r = this.rings.get(id);
    if (r?.sparkle) r.sparkle.visible = false;
  }

  /** Points followers may wander over to look at. */
  pointsOfInterest(): Array<{ x: number; z: number }> {
    const extra = propLayout()
      .filter((p) => p.kind === 'lamp' || p.kind === 'tamarisk')
      .map((p) => ({ x: p.x + 0.8, z: p.z + 0.8 }));
    return [...this.spots.map((s) => ({ x: s.x, z: s.z })), ...extra];
  }

  update(time: number, reducedMotion: boolean): void {
    for (const [id, r] of this.rings) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 3 + r.y) * 0.06;
      const base = r.kind === 'bench' ? 0.8 : 1;
      const scale = (id === this.active ? pulse * 1.15 : pulse) * base;
      r.ring.scale.set(scale, 1, scale);
      if (r.sparkle) {
        r.sparkle.rotation.y = time * 1.5;
        r.sparkle.position.y = r.y + 2.4 + (reducedMotion ? 0 : Math.sin(time * 2 + r.y) * 0.15);
      }
    }
  }

  dispose(): void {
    this.ringGeo.dispose();
    this.sparkleGeo.dispose();
    this.ringMat.dispose();
    this.ringActiveMat.dispose();
    this.sparkleMat.dispose();
  }
}

/** Which named area contains a point (lowest priority number wins). */
export function areaAt(x: number, z: number): Area | null {
  let best: Area | null = null;
  for (const a of areas) {
    const b = a.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      if (!best || a.priority < best.priority) best = a;
    }
  }
  return best;
}
