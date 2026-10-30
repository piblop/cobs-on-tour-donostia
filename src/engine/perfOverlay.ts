import type * as THREE from 'three';

/** Development-only frame stats. main.ts only imports this when import.meta.env.DEV. */
export class PerfOverlay {
  private el: HTMLElement;
  private frames = 0;
  private acc = 0;
  private worst = 0;
  private visible = true;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dev-overlay';
    document.body.append(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  update(frameSeconds: number, info: THREE.WebGLInfo, scene: THREE.Scene): void {
    this.frames++;
    this.acc += frameSeconds;
    this.worst = Math.max(this.worst, frameSeconds);
    if (this.acc < 0.5 || !this.visible) return;
    let objects = 0;
    scene.traverseVisible(() => objects++);
    const avg = (this.acc / this.frames) * 1000;
    this.el.textContent = [
      `frame  ${avg.toFixed(2)} ms (${(1000 / avg).toFixed(0)} fps)`,
      `worst  ${(this.worst * 1000).toFixed(1)} ms`,
      `calls  ${info.render.calls}`,
      `tris   ${info.render.triangles.toLocaleString()}`,
      `objs   ${objects}`,
      `geo/tex ${info.memory.geometries}/${info.memory.textures}`,
    ].join('\n');
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
  }
}
