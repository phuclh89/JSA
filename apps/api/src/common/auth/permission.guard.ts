import { CanActivate, ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { AccessDeniedError } from '../errors/application-errors';
import { REQUIRED_PERMISSIONS } from './auth.constants';
import { SecurityAuditService } from '../../modules/security/application/security-audit.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly audit?: SecurityAuditService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (required.every((permission) => user?.permissions.includes(permission))) return true;
    if (user && this.audit)
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'AUTHORIZATION_DENIED',
        targetType: 'API_PERMISSION',
        comment: `Required permission missing: ${required.join(',')}`,
      });
    throw new AccessDeniedError();
  }
}
