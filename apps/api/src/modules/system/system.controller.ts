import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('system')
export class SystemController {
  @Get('me')
  @UseGuards(EnterpriseAuthGuard, PermissionGuard)
  @RequirePermissions('SYSTEM_HEALTH_VIEW')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
