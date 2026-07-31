import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, JsaCopyCapabilities } from '@jsams/shared-types';
import { AccessDeniedError, StateConflictError } from '../../../common/errors/application-errors';

@Injectable()
export class JsaCopyCapabilityService {
  constructor(private readonly config: ConfigService) {}

  state(user: AuthenticatedUser): JsaCopyCapabilities {
    const viewCode = this.config.get<string>('JSA_PERMISSION_VIEW');
    const createCode = this.config.get<string>('JSA_PERMISSION_CREATE');
    const copyCode = this.config.get<string>('JSA_PERMISSION_COPY');
    const configured = Boolean(viewCode && createCode && copyCode);
    return {
      view: Boolean(viewCode && user.permissions.includes(viewCode)),
      create: Boolean(createCode && user.permissions.includes(createCode)),
      copy: Boolean(copyCode && user.permissions.includes(copyCode)),
      configured,
      ...(!configured
        ? { unavailableReason: 'JSA View, Create, and Copy mappings must be configured' }
        : {}),
    };
  }

  require(user: AuthenticatedUser): void {
    const state = this.state(user);
    if (!state.configured)
      throw new StateConflictError('JSA Copy permission mapping is not configured');
    if (!state.view || !state.create || !state.copy) throw new AccessDeniedError();
  }

  requireView(user: AuthenticatedUser): void {
    const code = this.config.get<string>('JSA_PERMISSION_VIEW');
    if (!code) throw new StateConflictError('JSA View permission mapping is not configured');
    if (!user.permissions.includes(code)) throw new AccessDeniedError();
  }
}
