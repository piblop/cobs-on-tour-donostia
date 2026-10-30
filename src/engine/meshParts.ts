import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Bake static primitive parts by material within each animated group. Mesh
 * children are outline hulls; expression / limb groups keep their own pivots.
 * The caller owns and disposes the resulting geometries with its source parts.
 */
export function batchStaticParts(parent: THREE.Group, geometries: THREE.BufferGeometry[]): void {
  const batches = new Map<string, { material: THREE.Material; shadow: boolean; parts: THREE.BufferGeometry[] }>();
  const collect = (mesh: THREE.Mesh, matrix: THREE.Matrix4) => {
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}:${mesh.castShadow}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { material, shadow: mesh.castShadow, parts: [] };
      batches.set(key, batch);
    }
    batch.parts.push(mesh.geometry.clone().applyMatrix4(matrix));
  };
  for (const child of [...parent.children]) {
    if (child instanceof THREE.Group) batchStaticParts(child, geometries);
    if (!(child instanceof THREE.Mesh)) continue;
    child.updateMatrix();
    collect(child, child.matrix);
    for (const hull of child.children) {
      if (!(hull instanceof THREE.Mesh)) continue;
      hull.updateMatrix();
      collect(hull, new THREE.Matrix4().multiplyMatrices(child.matrix, hull.matrix));
    }
    parent.remove(child);
  }
  for (const batch of batches.values()) {
    const geo = mergeGeometries(batch.parts)!;
    batch.parts.forEach((g) => g.dispose());
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, batch.material);
    mesh.castShadow = batch.shadow;
    parent.add(mesh);
  }
}
