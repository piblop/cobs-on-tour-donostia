import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Character } from '../../src/crew/character.ts';
import { crew } from '../../src/data/crew.ts';
import { Crowds } from '../../src/world/crowds.ts';

function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingBox();
    bounds.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
  });
  return bounds;
}

describe('character presentation', () => {
  it('keeps idle heads beneath the existing standing and seated bubble anchors', () => {
    for (const member of crew) {
      const c = new Character(member);
      c.animate(0, 0, 4, false);
      expect(visibleBounds(c.root).max.y).toBeLessThan(3.4);
      c.seated = true;
      c.animate(0, 0, 4, false);
      expect(visibleBounds(c.root).max.y).toBeLessThan(2.7);
      c.dispose();
    }
  });

  it('keeps animation below the gameplay root, including hops and seated poses', () => {
    const c = new Character(crew[3]);
    c.root.position.set(12, 1.4, -7);
    c.root.rotation.y = 1.2;
    const scale = c.root.scale.clone();
    c.setUmbrella(true);
    c.hop();
    c.cheering = 2;
    c.animate(0.2, 3, 4, false);
    c.seated = true;
    c.animate(0.2, 0, 4, false);
    expect(c.root.position.toArray()).toEqual([12, 1.4, -7]);
    expect(c.root.rotation.y).toBe(1.2);
    expect(c.root.scale.equals(scale)).toBe(true);
    c.dispose();
  });

  it('produces the same walk pose at 30 and 144 fps', () => {
    const a = new Character(crew[0]);
    const b = new Character(crew[0]);
    for (let i = 0; i < 30; i++) a.animate(1 / 30, 4, 4, false);
    for (let i = 0; i < 144; i++) b.animate(1 / 144, 4, 4, false);
    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    const poseA: number[] = [];
    const poseB: number[] = [];
    // Compare animated pivot matrices; blink visibility can differ naturally.
    a.root.traverse((o) => { if (o instanceof THREE.Group) poseA.push(...o.matrix.elements); });
    b.root.traverse((o) => { if (o instanceof THREE.Group) poseB.push(...o.matrix.elements); });
    expect(poseA.length).toBe(poseB.length);
    poseA.forEach((n, i) => expect(n).toBeCloseTo(poseB[i], 8));
    a.dispose();
    b.dispose();
  });

  it('suppresses hop displacement and squash with reduced motion', () => {
    const c = new Character(crew[1]);
    const body = c.root.children[0];
    c.hop();
    c.animate(0.2, 0, 4, true);
    expect(body.position.y).toBe(0);
    expect(body.scale.toArray()).toEqual([1, 1, 1]);
    c.dispose();
  });
});

describe('townsfolk presentation', () => {
  it('keeps all people instanced and within the fixed capacity as populations change', () => {
    const crowds = new Crowds();
    expect(crowds.group.children).toHaveLength(5);
    for (const hour of [12, 17, 21, 3]) {
      crowds.update(1 / 60, hour, false);
      for (const child of crowds.group.children) {
        expect(child).toBeInstanceOf(THREE.InstancedMesh);
        const mesh = child as THREE.InstancedMesh;
        expect(mesh.count).toBeGreaterThanOrEqual(0);
        expect(mesh.count).toBeLessThanOrEqual(40);
      }
    }
    crowds.dispose();
  });

  it('keeps skin colours with the night crowd after compacting the visible instances', () => {
    const crowds = new Crowds();
    crowds.update(0, 12, false);
    crowds.update(0, 21, false);
    const heads = crowds.group.children[1] as THREE.InstancedMesh;
    const skin = new THREE.Color();
    heads.getColorAt(0, skin);
    const expected = new THREE.Color('#a87458');
    expect(skin.r).toBeCloseTo(expected.r, 6);
    expect(skin.g).toBeCloseTo(expected.g, 6);
    expect(skin.b).toBeCloseTo(expected.b, 6);
    const matrix = new THREE.Matrix4();
    heads.getMatrixAt(0, matrix);
    crowds.update(0, 21, false);
    const paused = new THREE.Matrix4();
    heads.getMatrixAt(0, paused);
    expect(paused.equals(matrix)).toBe(true);
    crowds.dispose();
  });
});
