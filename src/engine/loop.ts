import { MAX_FRAME_SECONDS, MAX_STEPS_PER_FRAME, SIM_DT } from '../data/tuning.ts';

/**
 * Fixed-timestep accumulator. Pure and clock-agnostic so tests can drive it
 * with any frame rate.
 */
export class FixedStepper {
  private accumulator = 0;
  /** Real seconds of simulation dropped because of stalls (diagnostics only). */
  dropped = 0;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly dt = SIM_DT,
    private readonly maxFrame = MAX_FRAME_SECONDS,
    private readonly maxSteps = MAX_STEPS_PER_FRAME,
  ) {}

  /** Advance by a real frame delta. Returns the interpolation alpha in [0, 1). */
  advance(frameSeconds: number): number {
    let frame = frameSeconds;
    if (!(frame > 0)) frame = 0;
    if (frame > this.maxFrame) {
      this.dropped += frame - this.maxFrame;
      frame = this.maxFrame;
    }
    this.accumulator += frame;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.step(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps === this.maxSteps && this.accumulator >= this.dt) {
      // Too far behind: drop the backlog instead of spiralling.
      this.dropped += this.accumulator - (this.accumulator % this.dt);
      this.accumulator %= this.dt;
    }
    return this.accumulator / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

/**
 * Browser driver: requestAnimationFrame plus visibility handling.
 * When the tab is hidden the loop stops; on return the clock is re-based so
 * nothing jumps.
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private running = false;
  private readonly stepper: FixedStepper;

  constructor(
    step: (dt: number) => void,
    private readonly render: (alpha: number, frameSeconds: number) => void,
    private readonly onVisibility?: (visible: boolean) => void,
  ) {
    this.stepper = new FixedStepper(step);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.stepper.reset();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const seconds = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const alpha = this.stepper.advance(seconds);
    this.render(alpha, Math.min(seconds, MAX_FRAME_SECONDS));
    this.raf = requestAnimationFrame(this.frame);
  };

  private handleVisibility = (): void => {
    const visible = document.visibilityState === 'visible';
    if (visible) {
      this.onVisibility?.(true);
      this.start();
    } else {
      this.stop();
      this.onVisibility?.(false);
    }
  };
}
