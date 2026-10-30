import * as THREE from 'three';
import { areas, locations } from '../data/locations.ts';
import type { Area, LocationDef } from '../data/types.ts';
import { groundY } from './map.ts';

/**
 * Discoverable spots in the world. Each has a soft glowing ring that brightens
 * when it is the nearest usable thing, so nobody hunts for pixels.
 */
export class Interactables {
  readonly group = new THREE.Group();
  private rings = new Map<string, { ring: THREE.Mesh; sparkle: THREE.Mesh; y: number }>();
  private ringGeo = new THREE.RingGeometry(0.75, 0.95, 40);
  private sparkleGeo = new THREE.OctahedronGeometry(0.16, 0);
  private ringMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.55, depthWrite: false });
  private ringActiveMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.95, depthWrite: false });
  private sparkleMat = new THREE.MeshBasicMaterial({ color: '#fff6d8' });
  private active: string | null = null;

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2);
    for (const loc of locations) {
      const y = groundY(loc.position.x, loc.position.z) + 0.03;
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
      ring.position.set(loc.position.x, y, loc.position.z);
      ring.renderOrder = 2;
      const sparkle = new THREE.Mesh(this.sparkleGeo, this.sparkleMat);
      sparkle.position.set(loc.position.x, y + 2.4, loc.position.z);
      this.group.add(ring, sparkle);
      this.rings.set(loc.id, { ring, sparkle, y });
    }
  }

  /** The closest location within its interaction radius, if any. */
  nearest(x: number, z: number): LocationDef | null {
    let best: LocationDef | null = null;
    let bestD = Infinity;
    for (const loc of locations) {
      const d = Math.hypot(loc.position.x - x, loc.position.z - z);
      if (d <= loc.interactRadius && d < bestD) {
        best = loc;
        bestD = d;
      }
    }
    return best;
  }

  setActive(id: string | null): void {
    if (id === this.active) return;
    if (this.active) this.rings.get(this.active)!.ring.material = this.ringMat;
    this.active = id;
    if (id) this.rings.get(id)!.ring.material = this.ringActiveMat;
  }

  /** World anchor for the floating prompt above a location. */
  promptAnchor(id: string, out: THREE.Vector3): THREE.Vector3 {
    const r = this.rings.get(id)!;
    return out.copy(r.sparkle.position).setY(r.y + 2.9);
  }

  /** Discovered spots keep a gentler marker so they still invite revisits. */
  markDiscovered(id: string): void {
    const r = this.rings.get(id);
    if (r) r.sparkle.visible = false;
  }

  update(time: number, reducedMotion: boolean): void {
    for (const [id, r] of this.rings) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 3 + r.y) * 0.06;
      const scale = id === this.active ? pulse * 1.15 : pulse;
      r.ring.scale.set(scale, 1, scale);
      r.sparkle.rotation.y = time * 1.5;
      r.sparkle.position.y = r.y + 2.4 + (reducedMotion ? 0 : Math.sin(time * 2 + r.y) * 0.15);
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
