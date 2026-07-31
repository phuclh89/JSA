import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JsaVersioningService } from './application/jsa-versioning.service';

@Controller('jsa-versions')
@UseGuards(EnterpriseAuthGuard)
export class JsaVersioningController {
  constructor(private readonly service: JsaVersioningService) {}

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.service.capabilityState(user);
  }

  @Post(':id/checkout')
  checkout(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.checkout(id, user);
  }

  @Post(':id/undo-checkout')
  undo(
    @Param('id') id: string,
    @Body() body: { reason?: string } = {},
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.undoCheckout(id, body.reason, user);
  }

  @Get(':id/compare')
  compare(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.compare(id, user);
  }

  @Get(':id/history')
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.history(id, user);
  }
}
