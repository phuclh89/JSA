import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class SecurityController {
  @Get('me')
  @UseGuards(EnterpriseAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
