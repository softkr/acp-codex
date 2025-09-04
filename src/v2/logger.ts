export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

type LogEntry = {
  ts: number;
  level: LogLevel;
  msg: string;
  data?: Record<string, unknown>;
};

/**
 * High-performance ring buffer logger with structured entries and level filtering.
 * Avoids unbounded memory growth and minimizes allocations in hot paths.
 */
export class Logger {
  private levelOrder: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
  };
  private buffer: LogEntry[];
  private index = 0;
  private capacity: number;
  private currentLevel: LogLevel;
  private out: (line: string) => void;

  constructor({
    level = (process.env.ACP_LOG_LEVEL as LogLevel) || 'info',
    capacity = 1024,
    sink,
  }: { level?: LogLevel; capacity?: number; sink?: (line: string) => void } = {}) {
    this.capacity = Math.max(64, capacity | 0);
    this.buffer = new Array(this.capacity);
    this.currentLevel = level;
    this.out = sink || ((line) => process.stderr.write(line + '\n'));
  }

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] <= this.levelOrder[this.currentLevel];
  }

  private push(entry: LogEntry) {
    this.buffer[this.index] = entry;
    this.index = (this.index + 1) % this.capacity;
    // Emit immediately to sink to maintain real-time observability
    this.out(JSON.stringify(entry));
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;
    // Avoid allocating when no data
    const entry: LogEntry = data ? { ts: Date.now(), level, msg, data } : { ts: Date.now(), level, msg };
    this.push(entry);
  }

  error(msg: string, data?: Record<string, unknown>) { this.log('error', msg, data); }
  warn(msg: string, data?: Record<string, unknown>) { this.log('warn', msg, data); }
  info(msg: string, data?: Record<string, unknown>) { this.log('info', msg, data); }
  debug(msg: string, data?: Record<string, unknown>) { this.log('debug', msg, data); }
  trace(msg: string, data?: Record<string, unknown>) { this.log('trace', msg, data); }

  flush(): LogEntry[] {
    // Returns a copy in chronological order
    const out: LogEntry[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.index + i) % this.capacity;
      const v = this.buffer[idx];
      if (v) out.push(v);
    }
    return out;
  }
}

