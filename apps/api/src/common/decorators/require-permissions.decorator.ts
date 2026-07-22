import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS } from '../auth/auth.constants';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
