export interface FrameDriver {
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
  visible(): boolean;
}

// Invalidation draws a single frame while still; only active motion schedules
// its successor. Visibility changes reset the clock instead of catching up.
export class FrameLoop {
  time = 0;
  frames = 0;
  private pending?: number;
  private previous?: number;
  private driver: FrameDriver;
  private animate: () => boolean;
  private speed: () => number;
  private draw: (time: number) => void;
  constructor(driver: FrameDriver, animate: () => boolean, speed: () => number, draw: (time: number) => void) {
    this.driver = driver; this.animate = animate; this.speed = speed; this.draw = draw;
  }
  invalidate = () => {
    if (this.driver.visible() && this.pending === undefined) this.pending = this.driver.request(this.tick);
  };
  private tick = (now: number) => {
    this.pending = undefined;
    if (!this.driver.visible()) { this.previous = undefined; return; }
    const active = this.animate();
    if (active && this.previous !== undefined) this.time += Math.min(0.1, Math.max(0, (now - this.previous) / 1000)) * this.speed();
    this.previous = active ? now : undefined;
    this.draw(this.time); this.frames++;
    if (active) this.invalidate();
  };
  visibilityChanged = () => {
    if (this.pending !== undefined) this.driver.cancel(this.pending);
    this.pending = undefined; this.previous = undefined; this.invalidate();
  };
  reset() { this.time = 0; this.previous = undefined; this.invalidate(); }
  destroy() { if (this.pending !== undefined) this.driver.cancel(this.pending); this.pending = undefined; }
}
