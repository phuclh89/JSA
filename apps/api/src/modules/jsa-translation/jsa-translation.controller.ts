import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JsaTranslationService } from './application/jsa-translation.service';

@Controller('jsa-translations')
@UseGuards(EnterpriseAuthGuard)
export class JsaTranslationController {
  constructor(private readonly service: JsaTranslationService) {}

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.service.capabilityState(user);
  }

  @Get('assignment-preflight/:jsaId')
  preflight(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.assignmentPreflight(jsaId, user);
  }

  @Get('translator-candidates/:jsaId')
  candidates(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.translatorCandidates(jsaId, user);
  }

  @Post('assign')
  assign(
    @Body() body: { jsaId: string; targetLanguageId: string; translatorUserId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.assign(body, user);
  }

  @Get('tasks')
  tasks(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list('tasks', query, user);
  }

  @Get('review')
  reviewQueue(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list('review', query, user);
  }

  @Get('published')
  published(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list('published', query, user);
  }

  @Get('outdated')
  outdated(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list('outdated', query, user);
  }

  @Get('counts')
  counts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.counts(user);
  }

  @Get('published-for-jsa/:jsaId')
  publishedForJsa(@Param('jsaId') jsaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.publishedForJsa(jsaId, user);
  }

  @Get(':id/actions')
  actions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.actions(id, user);
  }

  @Get(':id/print')
  print(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.print(id, user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(id, user);
  }

  @Put(':id/segments')
  save(
    @Param('id') id: string,
    @Body() body: { segments: Array<{ id: string; text: string; rowVersion: string }> },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.save(id, body, user);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.submit(id, user);
  }

  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() body: { action: 'RETURN' | 'COMMENT' | 'PUBLISH'; comment?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.review(id, body, user);
  }

  @Post(':id/refresh')
  refresh(
    @Param('id') id: string,
    @Body() body: { translatorUserId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.refresh(id, body, user);
  }
}
