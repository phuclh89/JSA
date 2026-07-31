import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JsaCopyService } from './application/jsa-copy.service';
import { JsaCopyCommandDto, JsaCopyPreflightDto } from './dto/jsa-copy.dto';

@Controller('jsa')
@UseGuards(EnterpriseAuthGuard)
export class JsaCopyController {
  constructor(private readonly service: JsaCopyService) {}

  @Get('copy-capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.service.capabilityState(user);
  }

  @Get(':jsaId/copy-destinations')
  destinations(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.destinationOptions(jsaId, user);
  }

  @Post(':jsaId/copy-preflight')
  preflight(
    @Param('jsaId') jsaId: string,
    @Body() body: JsaCopyPreflightDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.preflight(jsaId, body, user);
  }

  @Post(':jsaId/copy')
  copy(
    @Param('jsaId') jsaId: string,
    @Body() body: JsaCopyCommandDto,
    @Headers('idempotency-key') requestKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.copy(jsaId, body, requestKey, user);
  }

  @Get(':jsaId/copy-provenance')
  provenance(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.provenance(jsaId, user);
  }
}
