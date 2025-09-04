import { Logger } from '../logger.js';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions';

export type PermissionRequest = {
  kind: 'read' | 'write' | 'exec' | 'network' | 'other';
  resource?: string;
  metadata?: Record<string, unknown>;
};

export type PermissionDecision = {
  allow: boolean;
  reason?: string;
};

export class PermissionEngine {
  private readonly log: Logger;
  private mode: PermissionMode;

  constructor(log: Logger, mode?: PermissionMode) {
    this.log = log;
    this.mode = mode || (process.env.ACP_PERMISSION_MODE as PermissionMode) || 'default';
    this.log.debug('perm.init', { mode: this.mode });
  }

  setMode(mode: PermissionMode) {
    this.mode = mode;
  }

  decide(req: PermissionRequest): PermissionDecision {
    switch (this.mode) {
      case 'bypassPermissions':
        return { allow: true, reason: 'bypass' };
      case 'acceptEdits':
        if (req.kind === 'write' || req.kind === 'read') return { allow: true, reason: 'edit-auto-accept' };
        return { allow: false, reason: 'non-edit operation requires approval' };
      default:
        // default: conservative deny unless explicit read
        if (req.kind === 'read') return { allow: true, reason: 'safe-read' };
        return { allow: false, reason: 'requires user approval' };
    }
  }
}

