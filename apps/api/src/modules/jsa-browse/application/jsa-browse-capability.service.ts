import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, JsaBrowseKind } from '@jsams/shared-types';
import { AccessDeniedError, StateConflictError } from '../../../common/errors/application-errors';

@Injectable()
export class JsaBrowseCapabilityService {
  constructor(private readonly config: ConfigService) {}

  requireView(user: AuthenticatedUser, kind: JsaBrowseKind) {
    const key = kind === 'drafts' ? 'JSA_PERMISSION_VIEW' : 'JSA_PERMISSION_WORKFLOW_VIEW';
    const code = this.config.get<string>(key);
    if (!code) throw new StateConflictError('JSA browse permission mapping is not configured');
    if (!user.permissions.includes(code)) throw new AccessDeniedError();
  }

  requireFavorite(user: AuthenticatedUser) {
    const code = this.config.get<string>('JSA_PERMISSION_FAVORITE');
    if (!code) throw new StateConflictError('JSA favorite permission mapping is not configured');
    if (!user.permissions.includes(code)) throw new AccessDeniedError();
  }

  state(user: AuthenticatedUser) {
    const viewCode = this.config.get<string>('JSA_PERMISSION_WORKFLOW_VIEW');
    const favoriteCode = this.config.get<string>('JSA_PERMISSION_FAVORITE');
    return {
      view: Boolean(viewCode && user.permissions.includes(viewCode)),
      favorite: Boolean(favoriteCode && user.permissions.includes(favoriteCode)),
      favoriteConfigured: Boolean(favoriteCode),
      ...(!viewCode || !favoriteCode
        ? { unavailableReason: 'One or more JSA browse permission mappings are not configured' }
        : {}),
    };
  }
}
