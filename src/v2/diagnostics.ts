import { Logger } from './logger.js';

export type DiagnosticReport = {
  node: string;
  platform: string;
  arch: string;
  memory: { rssMB: number; heapUsedMB: number; heapTotalMB: number };
  env: { permissionMode?: string; debug?: boolean };
};

export function runDiagnostics(log: Logger): DiagnosticReport {
  const mem = process.memoryUsage();
  const report: DiagnosticReport = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    memory: {
      rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
    },
    env: {
      permissionMode: process.env.ACP_PERMISSION_MODE,
      debug: process.env.ACP_DEBUG === 'true',
    },
  };
  log.info('diagnostics.report', report as unknown as Record<string, unknown>);
  return report;
}

