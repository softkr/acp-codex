import { Logger } from '../logger.js';
import { ProtocolIO, ProtocolMessage } from '../protocol/io.js';
import { PermissionEngine } from '../permissions/engine.js';
import { Runtime } from '../core/runtime.js';
import { CodexClient } from './codex-client.js';
import { CodexCLIClient } from './codex-cli-client.js';

/**
 * Orchestrator wires protocol messages to internal handlers and manages flow.
 * This is a minimal MVP that can be extended with ACP-specific routing.
 */
export class Orchestrator {
  private codex: CodexClient;
  private codexCLI: CodexCLIClient;
  private useCodexCLI: boolean;
  
  constructor(
    private readonly log: Logger,
    private readonly io: ProtocolIO,
    private readonly perms: PermissionEngine,
    private readonly rt: Runtime,
  ) {
    // Check if we should use Codex CLI or API
    this.useCodexCLI = process.env.USE_CODEX_CLI === 'true';
    
    // Initialize API client (fallback)
    this.codex = new CodexClient(log, {
      model: process.env.CODEX_MODEL || 'gpt-5',
      temperature: parseFloat(process.env.CODEX_TEMPERATURE || '0.1'),
      maxTokens: parseInt(process.env.CODEX_MAX_TOKENS || '2000', 10)
    });
    
    // Initialize CLI client
    this.codexCLI = new CodexCLIClient(log, {
      codexPath: process.env.CODEX_CLI_PATH || 'codex',
      useLocalCLI: this.useCodexCLI
    });
  }

  async start() {
    // Try to connect to Codex CLI if enabled
    if (this.useCodexCLI) {
      try {
        const isInstalled = await CodexCLIClient.isInstalled();
        if (isInstalled) {
          const version = await CodexCLIClient.getVersion();
          this.log.info('codex.cli.detected', { version });
          await this.codexCLI.connect();
        } else {
          this.log.warn('codex.cli.not.installed', { fallback: 'API' });
          this.useCodexCLI = false;
        }
      } catch (error) {
        this.log.error('codex.cli.init.failed', { 
          error: error instanceof Error ? error.message : String(error),
          fallback: 'API'
        });
        this.useCodexCLI = false;
      }
    }
    
    this.io.on('message', (msg: ProtocolMessage) => {
      this.rt.schedule(() => this.handleMessage(msg));
    });
    this.log.info('orchestrator.started', { mode: this.useCodexCLI ? 'CLI' : 'API' });
  }

  private async handleMessage(msg: ProtocolMessage) {
    // Placeholder routing: respond to simple pings and permission probes
    if (msg && typeof msg === 'object') {
      const t = (msg['type'] as string) || '';
      
      if (t === 'ping') {
        this.io.send({ id: msg.id, type: 'pong', ts: Date.now() });
        return;
      }
      
      if (t === 'permission.check') {
        const decision = this.perms.decide({ kind: (msg['kind'] as any) || 'other', resource: msg['resource'] as string });
        this.io.send({ id: msg.id, type: 'permission.result', ...decision });
        return;
      }
      
      // Handle Codex-specific requests
      if (t === 'codex.complete') {
        try {
          const prompt = msg['prompt'] as string;
          const options = msg['options'] as any || {};
          
          // Use CLI if available, otherwise fallback to API
          const result = this.useCodexCLI 
            ? await this.codexCLI.complete(prompt, options)
            : await this.codex.complete(prompt, options);
            
          this.io.send({ id: msg.id, type: 'codex.result', content: result });
        } catch (error) {
          this.io.send({ 
            id: msg.id, 
            type: 'codex.error', 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
        return;
      }
      
      if (t === 'codex.suggest') {
        try {
          const code = msg['code'] as string;
          const cursor = msg['cursor'] as { line: number; column: number };
          const language = msg['language'] as string | undefined;
          
          // Use CLI if available, otherwise fallback to API
          const suggestions = this.useCodexCLI
            ? await this.codexCLI.suggest(code, cursor, language)
            : await this.codex.suggest(code, cursor, language);
            
          this.io.send({ id: msg.id, type: 'codex.suggestions', suggestions });
        } catch (error) {
          this.io.send({ 
            id: msg.id, 
            type: 'codex.error', 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
        return;
      }
      
      if (t === 'codex.explain') {
        try {
          const code = msg['code'] as string;
          const language = msg['language'] as string | undefined;
          const explanation = await this.codex.explain(code, language);
          this.io.send({ id: msg.id, type: 'codex.explanation', content: explanation });
        } catch (error) {
          this.io.send({ 
            id: msg.id, 
            type: 'codex.error', 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
        return;
      }
      
      if (t === 'codex.refactor') {
        try {
          const code = msg['code'] as string;
          const instruction = msg['instruction'] as string;
          const language = msg['language'] as string | undefined;
          const refactored = await this.codex.refactor(code, instruction, language);
          this.io.send({ id: msg.id, type: 'codex.refactored', content: refactored });
        } catch (error) {
          this.io.send({ 
            id: msg.id, 
            type: 'codex.error', 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
        return;
      }
    }
    // Default echo + info (useful during integration bring-up)
    this.io.send({ id: msg.id, type: 'ack', received: msg });
  }
}

