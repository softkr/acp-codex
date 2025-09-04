import { Logger } from '../logger.js';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface CodexCLIConfig {
  codexPath?: string;  // Path to codex CLI binary
  apiKey?: string;     // For fallback to OpenAI API
  useLocalCLI?: boolean;  // Use local Codex CLI vs OpenAI API
}

export class CodexCLIClient extends EventEmitter {
  private codexProcess?: ChildProcess;
  private readonly codexPath: string;
  private readonly useLocalCLI: boolean;
  
  constructor(
    private readonly log: Logger,
    config: CodexCLIConfig = {}
  ) {
    super();
    
    // Check if we should use local Codex CLI or OpenAI API
    this.useLocalCLI = config.useLocalCLI ?? true;
    this.codexPath = config.codexPath || 'codex';  // Assumes codex is in PATH
    
    if (this.useLocalCLI) {
      this.log.info('codex.cli.mode', { mode: 'local-cli', path: this.codexPath });
    } else {
      this.log.info('codex.cli.mode', { mode: 'api-fallback' });
    }
  }
  
  /**
   * Initialize connection to Codex CLI
   */
  async connect(): Promise<void> {
    if (!this.useLocalCLI) {
      this.log.info('codex.cli.skip', { reason: 'API mode selected' });
      return;
    }
    
    try {
      // Start codex CLI in proto mode for stdin/stdout communication
      this.codexProcess = spawn(this.codexPath, ['proto'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CODEX_NO_TELEMETRY: '1',
          CODEX_JSON_OUTPUT: '1'
        }
      });
      
      this.codexProcess.stdout?.on('data', (data) => {
        this.handleOutput(data.toString());
      });
      
      this.codexProcess.stderr?.on('data', (data) => {
        this.log.error('codex.cli.stderr', { error: data.toString() });
      });
      
      this.codexProcess.on('error', (error) => {
        this.log.error('codex.cli.error', { error: error.message });
        this.emit('error', error);
      });
      
      this.codexProcess.on('exit', (code) => {
        this.log.info('codex.cli.exit', { code });
        this.emit('exit', code);
      });
      
      this.log.info('codex.cli.connected');
    } catch (error) {
      this.log.error('codex.cli.connect.failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
  
  /**
   * Send a command to Codex CLI
   */
  async sendCommand(command: string): Promise<void> {
    if (!this.codexProcess?.stdin) {
      throw new Error('Codex CLI not connected');
    }
    
    this.codexProcess.stdin.write(command + '\n');
    this.log.debug('codex.cli.command.sent', { command });
  }
  
  /**
   * Handle output from Codex CLI
   */
  private handleOutput(data: string) {
    try {
      // Try to parse as JSON
      const lines = data.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('{')) {
          try {
            const json = JSON.parse(line);
            this.emit('message', json);
            this.log.debug('codex.cli.message', { type: json.type });
          } catch {
            // Not JSON, emit as raw
            this.emit('raw', line);
          }
        } else {
          this.emit('raw', line);
        }
      }
    } catch (error) {
      this.log.error('codex.cli.parse.error', { 
        error: error instanceof Error ? error.message : String(error),
        data 
      });
    }
  }
  
  /**
   * Execute a code completion request
   */
  async complete(prompt: string, options: any = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Codex CLI completion timeout'));
      }, 30000);
      
      const handler = (message: any) => {
        if (message.type === 'completion' && message.id === options.id) {
          clearTimeout(timeout);
          this.removeListener('message', handler);
          resolve(message.content || '');
        }
      };
      
      this.on('message', handler);
      
      this.sendCommand(JSON.stringify({
        type: 'complete',
        id: options.id || Date.now().toString(),
        prompt,
        ...options
      })).catch(reject);
    });
  }
  
  /**
   * Get code suggestions
   */
  async suggest(
    code: string,
    cursor: { line: number; column: number },
    language?: string
  ): Promise<string[]> {
    const response = await this.complete(
      this.buildSuggestionPrompt(code, cursor, language),
      { type: 'suggestion' }
    );
    
    return this.parseSuggestions(response);
  }
  
  private buildSuggestionPrompt(
    code: string,
    cursor: { line: number; column: number },
    language?: string
  ): string {
    const lines = code.split('\n');
    const currentLine = lines[cursor.line - 1] || '';
    const prefix = currentLine.substring(0, cursor.column);
    const context = lines.slice(Math.max(0, cursor.line - 10), cursor.line).join('\n');
    
    return JSON.stringify({
      context,
      prefix,
      language: language || 'auto',
      cursor
    });
  }
  
  private parseSuggestions(response: string): string[] {
    try {
      if (response.startsWith('[')) {
        return JSON.parse(response);
      }
      
      const lines = response.split('\n');
      return lines
        .filter(line => line.trim().length > 0)
        .slice(0, 5);
    } catch {
      return [response];
    }
  }
  
  /**
   * Check if Codex CLI is installed
   */
  static async isInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn('which', ['codex']);
      check.on('exit', (code) => {
        resolve(code === 0);
      });
      check.on('error', () => {
        resolve(false);
      });
    });
  }
  
  /**
   * Get Codex CLI version
   */
  static async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn('codex', ['--version']);
      let version = '';
      
      proc.stdout?.on('data', (data) => {
        version += data.toString();
      });
      
      proc.on('exit', () => {
        const match = version.match(/(\d+\.\d+\.\d+)/);
        resolve(match ? match[1] : null);
      });
      
      proc.on('error', () => {
        resolve(null);
      });
    });
  }
  
  /**
   * Disconnect from Codex CLI
   */
  disconnect(): void {
    if (this.codexProcess) {
      this.codexProcess.kill('SIGTERM');
      this.codexProcess = undefined;
      this.log.info('codex.cli.disconnected');
    }
  }
}
