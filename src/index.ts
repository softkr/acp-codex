import { Logger } from './v2/logger.js';
import { runDiagnostics as v2Diagnostics } from './v2/diagnostics.js';
import { ProtocolIO } from './v2/protocol/io.js';
import { PermissionEngine } from './v2/permissions/engine.js';
import { Runtime } from './v2/core/runtime.js';
import { Orchestrator } from './v2/agent/orchestrator.js';

export async function main() {
  const argv = process.argv.slice(2);
  const logger = new Logger({ level: (process.env.ACP_DEBUG === 'true' ? 'debug' : 'info') as 'debug' | 'info' });
  
  // Set default to Codex CLI mode if not specified
  if (!process.env.USE_CODEX_CLI) {
    process.env.USE_CODEX_CLI = 'true';  // Default to Codex CLI mode
  }

  if (argv.includes('--diagnose') || argv.includes('--diagnostics')) {
    const report = v2Diagnostics(logger);
    console.error('Diagnostics:\n' + JSON.stringify(report, null, 2));
    process.exit(0);
    return;
  }

  if (argv.includes('--setup')) {
    console.error('SETUP: Add to Zed settings.json:');
    console.error('{\n  "agent_servers": {\n    "codex": {\n      "command": "npx",');
    console.error('      "args": ["@softkr/acp-codex"],\n      "env": {')
    console.error('        "ACP_PERMISSION_MODE": "acceptEdits",');
    console.error('        "OPENAI_API_KEY": "your-api-key-here"\n      }\n    }\n  }\n}');
    process.exit(0);
    return;
  }

  if (argv.includes('--test')) {
    console.error('TEST: Starting echo mode. Send JSON lines.');
    const io = new ProtocolIO(logger);
    io.attach(process.stdin, process.stdout);
    io.on('message', (msg) => io.send({ type: 'echo', msg }));
    return;
  }

  if (argv.includes('--reset-permissions')) {
    console.error('Permission modes: default | acceptEdits | bypassPermissions');
    console.error('Set env: ACP_PERMISSION_MODE=acceptEdits');
    process.exit(0);
    return;
  }

  try {
    // Start v2 runtime
    const io = new ProtocolIO(logger);
    const perms = new PermissionEngine(logger);
    const rt = new Runtime(logger);
    const orch = new Orchestrator(logger, io, perms, rt);

    io.attach(process.stdin, process.stdout);
    await orch.start();

    // Keep process alive and handle shutdown
    process.stdin.resume();
    const shutdown = (sig: string) => {
      logger.info('shutdown.signal', { sig });
      io.dispose();
      process.exit(0);
    };
    
    // Handle unexpected errors
    process.on('uncaughtException', (error) => {
      logger.error('process.uncaughtException', { error: error.message, stack: error.stack });
      shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('process.unhandledRejection', { reason: String(reason), promise });
      shutdown('UNHANDLED_REJECTION');
    });
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    logger.info('acp.codex.started', { mode: process.env.USE_CODEX_CLI === 'true' ? 'CLI' : 'API' });
  } catch (error) {
    logger.error('acp.codex.startup.failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    process.exit(1);
  }
}

