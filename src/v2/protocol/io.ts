import { EventEmitter } from 'node:events';
import { Logger } from '../logger.js';

export type ProtocolMessage = Record<string, unknown> & { id?: string | number };

/**
 * Minimal, high-throughput line-delimited JSON protocol I/O.
 * Uses in-place buffering and avoids per-chunk allocations where possible.
 */
export class ProtocolIO extends EventEmitter {
  private readonly log: Logger;
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private disposed = false;

  constructor(log: Logger) {
    super();
    this.log = log;
  }

  attach(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream) {
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => this.onChunk(chunk));
    stdin.on('end', () => this.dispose());
    stdin.on('error', (err) => this.log.error('protocol.stdin.error', { err: (err as Error).message }));

    this.on('send', (msg: ProtocolMessage) => {
      if (this.disposed) return;
      try {
        const line = JSON.stringify(msg);
        stdout.write(line + '\n');
      } catch (err) {
        this.log.error('protocol.stdout.error', { err: (err as Error).message });
      }
    });
  }

  private onChunk(chunk: string) {
    this.buffer += chunk;
    let idx = this.buffer.indexOf('\n');
    let processed = 0;
    while (idx !== -1) {
      const line = this.buffer.slice(processed, idx);
      if (line.length > 0) {
        try {
          const msg = JSON.parse(line) as ProtocolMessage;
          this.emit('message', msg);
        } catch {
          this.log.warn('protocol.decode.warn', { linePreview: line.slice(0, 120) });
        }
      }
      processed = idx + 1;
      idx = this.buffer.indexOf('\n', processed);
    }
    // Keep the tail (partial line)
    this.buffer = this.buffer.slice(processed);
    if (this.buffer.length > 1_000_000) {
      // Prevent pathological unbounded buffer growth
      this.log.warn('protocol.buffer.trim', { size: this.buffer.length });
      this.buffer = '';
    }
  }

  send(msg: ProtocolMessage) {
    this.emit('send', msg);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.removeAllListeners();
  }
}

