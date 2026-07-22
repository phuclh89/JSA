import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { DataScopeDeniedError } from '../errors/application-errors';
import type { RequiredDataScope } from '../decorators/require-data-scope.decorator';
import { REQUIRED_DATA_SCOPE } from './auth.constants';
import { DataScopeService } from '../../modules/security/application/data-scope.service';

@Injectable()
export class DataScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scopes: DataScopeService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<RequiredDataScope>(REQUIRED_DATA_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string | undefined>;
    }>();
    const siteId = request.params[requirement.siteParameter];
    if (!request.user || !siteId || !/^\d+$/.test(siteId)) throw new DataScopeDeniedError();
    const allowed = this.scopes.allows(
      request.user,
      {
        scopeType: requirement.scopeType,
        siteId,
        ...(requirement.rigParameter && request.params[requirement.rigParameter]
          ? { rigId: request.params[requirement.rigParameter] }
          : {}),
        ...(requirement.departmentParameter && request.params[requirement.departmentParameter]
          ? { departmentId: request.params[requirement.departmentParameter] }
          : {}),
      },
      requirement.access,
    );
    if (!allowed) throw new DataScopeDeniedError();
    return true;
  }
}
