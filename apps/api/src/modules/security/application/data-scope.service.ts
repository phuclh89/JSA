import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, DataScope } from '@jsams/shared-types';

export type ScopeAccess = 'VIEW' | 'ACT';

@Injectable()
export class DataScopeService {
  allows(
    user: AuthenticatedUser,
    target: Pick<DataScope, 'scopeType' | 'siteId' | 'rigId' | 'departmentId'>,
    access: ScopeAccess,
  ): boolean {
    return user.dataScopes.some((scope) => {
      if (scope.siteId !== target.siteId) return false;
      if (access === 'ACT' ? !scope.canAct : !scope.canView) return false;
      if (scope.scopeType === 'SITE') return true;
      if (scope.scopeType === 'RIG') return Boolean(target.rigId && scope.rigId === target.rigId);
      return Boolean(
        target.departmentId &&
        scope.departmentId === target.departmentId &&
        (!target.rigId || !scope.rigId || scope.rigId === target.rigId),
      );
    });
  }
}
