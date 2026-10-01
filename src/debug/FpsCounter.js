// Minimal frame-time overlay (fps, ms, draw calls, triangles).
export class FpsCounter {
  constructor(renderer) {
    this.renderer = renderer;
    this.el = document.createElement('div');
    this.el.id = 'fps';
    document.body.appendChild(this.el);
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
    this.last = performance.now();
  }

  update() {
    // real time, not the engine's clamped dt
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.acc >= 0.5) {
      const fps = this.frames / this.acc;
      const info = this.renderer.info.render;
      this.el.textContent = `${fps.toFixed(0)} fps  ${(1000 / fps).toFixed(1)} ms  (worst ${(this.worst * 1000).toFixed(1)})  ` +
        `${info.calls} calls  ${(info.triangles / 1000).toFixed(0)}k tris`;
      this.el.style.color = fps >= 55 ? '#FFE2B0' : fps >= 40 ? '#FF8A1F' : '#ff5a2a';
      this.frames = 0;
      this.acc = 0;
      this.worst = 0;
    }
  }
}
