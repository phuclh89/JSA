import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import {
  ApplicationUserInactiveError,
  ApplicationUserNotRegisteredError,
} from '../../../common/errors/application-errors';
import { OracleService } from '../../../common/oracle/oracle.service';
import { SECURITY_REPOSITORY, type SecurityRepository } from '../domain/security.repository';
import type { EnterprisePrincipal } from '../domain/security.types';
import { effectivePermissions } from './permission-evaluator';

@Injectable()
export class UserContextService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(SECURITY_REPOSITORY) private readonly repository: SecurityRepository,
  ) {}

  async resolve(principal: EnterprisePrincipal): Promise<AuthenticatedUser> {
    return this.oracle.withTransaction(async (transaction) => {
      const user = await this.repository.findUser(
        transaction,
        principal.identityKey,
        principal.username,
        principal.mode === 'development',
      );
      if (!user) throw new ApplicationUserNotRegisteredError();
      if (!user.active) throw new ApplicationUserInactiveError();
      const assignments = await this.repository.loadAssignments(transaction, user.userId);
      return {
        userId: user.userId,
        enterpriseIdentityKey: user.enterpriseIdentityKey,
        username: user.username,
        displayName: user.displayName,
        ...(user.email ? { email: user.email } : {}),
        ...(user.defaultSiteId ? { defaultSiteId: user.defaultSiteId } : {}),
        ...(user.defaultRigId ? { defaultRigId: user.defaultRigId } : {}),
        ...(user.defaultDepartmentId ? { defaultDepartmentId: user.defaultDepartmentId } : {}),
        roles: assignments.roles,
        permissions: effectivePermissions(assignments.rolePermissions, assignments.overrides),
        permissionOverrides: assignments.overrides,
        dataScopes: assignments.dataScopes,
        authentication: {
          mode: principal.mode,
          ...(principal.sessionExpiresAt ? { sessionExpiresAt: principal.sessionExpiresAt } : {}),
        },
      };
    });
  }
}
