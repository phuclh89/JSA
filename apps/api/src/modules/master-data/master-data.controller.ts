import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { MasterDataService } from './application/master-data.service';
import {
  ActiveMutationDto,
  MasterDataListQueryDto,
  MasterDataMutationDto,
} from './dto/master-data.dto';

@Controller('master-data')
@UseGuards(EnterpriseAuthGuard, PermissionGuard)
@RequirePermissions('SYSTEM_ADMIN')
export class MasterDataController {
  constructor(private readonly service: MasterDataService) {}

  @Get('scope-options/list')
  scopeOptions(
    @Query('type') type: 'SITE' | 'RIG' | 'DEPARTMENT',
    @Query('siteId') siteId: string | undefined,
    @Query('rigId') rigId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.scopeOptions(type, siteId, rigId, user);
  }

  @Get(':kind/selection')
  selection(
    @Param('kind') kind: string,
    @Query() query: MasterDataListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.selection(this.service.assertKind(kind), query, user);
  }

  @Get(':kind')
  list(
    @Param('kind') kind: string,
    @Query() query: MasterDataListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(this.service.assertKind(kind), query, user);
  }

  @Get(':kind/:id')
  detail(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.detail(this.service.assertKind(kind), id, user);
  }

  @Post(':kind')
  create(
    @Param('kind') kind: string,
    @Body() body: MasterDataMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(this.service.assertKind(kind), body, user);
  }

  @Put(':kind/:id')
  update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: MasterDataMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(this.service.assertKind(kind), id, body, user);
  }

  @Post(':kind/:id/activate')
  activate(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: ActiveMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setActive(this.service.assertKind(kind), id, true, body.rowVersion, user);
  }

  @Post(':kind/:id/deactivate')
  deactivate(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: ActiveMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setActive(this.service.assertKind(kind), id, false, body.rowVersion, user);
  }
}
