import { SetMetadata } from '@nestjs/common';
import type { DataScope } from '@jsams/shared-types';
import { REQUIRED_DATA_SCOPE } from '../auth/auth.constants';
import type { ScopeAccess } from '../../modules/security/application/data-scope.service';

export interface RequiredDataScope {
  scopeType: DataScope['scopeType'];
  access: ScopeAccess;
  siteParameter: string;
  rigParameter?: string;
  departmentParameter?: string;
}

export const RequireDataScope = (requirement: RequiredDataScope) =>
  SetMetadata(REQUIRED_DATA_SCOPE, requirement);
