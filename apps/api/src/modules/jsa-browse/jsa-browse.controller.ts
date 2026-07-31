import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JsaBrowseService } from './application/jsa-browse.service';

@Controller('jsa-browse')
@UseGuards(EnterpriseAuthGuard)
export class JsaBrowseController {
  constructor(private readonly service: JsaBrowseService) {}

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.service.capabilityState(user);
  }

  @Get()
  browse(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.browse(query, user);
  }

  @Get('counts')
  counts(
    @Query('rigId') rigId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.counts(user, rigId);
  }

  @Get('facets')
  facets(
    @Query('rigId') rigId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.facets(user, rigId);
  }

  @Post(':jsaId/favorite')
  favorite(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.favorite(jsaId, true, user);
  }

  @Delete(':jsaId/favorite')
  unfavorite(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.favorite(jsaId, false, user);
  }
}
