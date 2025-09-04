import { Logger } from '../logger.js';

export type Task = () => void | Promise<void>;

/**
 * Runtime provides a lightweight cooperative scheduler and resource guards.
 * - Bounded microtask queue with backpressure
 * - Tick metrics for diagnostics and load shedding
 */
export class Runtime {
  private readonly log: Logger;
  private readonly queue: Task[] = [];
  private readonly capacity: number;
  private running = false;
  private dropped = 0;

  // Simple moving averages for loop delay and queue depth
  private loopDelayMs = 0;
  private depthAvg = 0;

  constructor(log: Logger, capacity = 2048) {
    this.log = log;
    this.capacity = Math.max(128, capacity | 0);
  }

  schedule(task: Task): boolean {
    if (this.queue.length >= this.capacity) {
      this.dropped++;
      if ((this.dropped & 0x3f) === 0) {
        this.log.warn('runtime.queue.drop', { dropped: this.dropped, capacity: this.capacity });
      }
      return false;
    }
    this.queue.push(task);
    if (!this.running) this.run();
    return true;
  }

  private async run() {
    this.running = true;
    let last = performance.now();
    try {
      while (this.queue.length) {
        const t = this.queue.shift()!;
        try {
          const res = t();
          if (res && typeof (res as Promise<void>).then === 'function') await res;
        } catch (err) {
          this.log.error('runtime.task.error', { err: err instanceof Error ? err.message : String(err) });
        }
        const now = performance.now();
        const dt = now - last;
        last = now;
        // EMA smoothing
        this.loopDelayMs = this.loopDelayMs * 0.9 + dt * 0.1;
        this.depthAvg = this.depthAvg * 0.9 + this.queue.length * 0.1;
        // Yield to event loop periodically
        if (dt > 8 || this.queue.length > this.capacity * 0.5) {
          await new Promise((r) => setImmediate(r));
        }
      }
    } finally {
      this.running = false;
    }
  }

  stats() {
    return {
      queueDepth: this.queue.length,
      dropped: this.dropped,
      loopDelayMs: Math.round(this.loopDelayMs * 100) / 100,
      depthAvg: Math.round(this.depthAvg * 100) / 100,
    };
  }
}

