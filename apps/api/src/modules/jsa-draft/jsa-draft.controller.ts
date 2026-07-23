import { Body,Controller,Get,Param,Post,Put,Query,UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JsaDraftService } from './application/jsa-draft.service';
import { CancelJsaDraftDto,CreateJsaDraftDto,ResolveJsaRiskDto,SaveJsaContentDto,UpdateJsaHeaderDto } from './dto/jsa-draft.dto';

@Controller('jsa-drafts')
@UseGuards(EnterpriseAuthGuard)
export class JsaDraftController {
  constructor(private readonly service:JsaDraftService){}
  @Get('capabilities') capabilities(@CurrentUser() user:AuthenticatedUser){return this.service.capabilityState(user);}
  @Get('options/:kind') options(@Param('kind') kind:string,@Query('siteId') siteId:string|undefined,@Query('rigId') rigId:string|undefined,@Query('departmentId') departmentId:string|undefined,@CurrentUser() user:AuthenticatedUser){return this.service.options(kind,siteId,rigId,departmentId,user);}
  @Get('effective-matrix/:rigId') effectiveMatrix(@Param('rigId') rigId:string,@CurrentUser() user:AuthenticatedUser){return this.service.effectiveMatrix(rigId,user);}
  @Post() create(@Body() body:CreateJsaDraftDto,@CurrentUser() user:AuthenticatedUser){return this.service.create(body,user);}
  @Get(':id') detail(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser){return this.service.detail(id,user);}
  @Put(':id') update(@Param('id') id:string,@Body() body:UpdateJsaHeaderDto,@CurrentUser() user:AuthenticatedUser){return this.service.updateHeader(id,body,user);}
  @Put(':id/content') save(@Param('id') id:string,@Body() body:SaveJsaContentDto,@CurrentUser() user:AuthenticatedUser){return this.service.saveContent(id,body as any,user);}
  @Post(':id/risk/resolve') resolveRisk(@Param('id') id:string,@Body() body:ResolveJsaRiskDto,@CurrentUser() user:AuthenticatedUser){return this.service.resolveRisk(id,body,user);}
  @Post(':id/validate') validate(@Param('id') id:string,@CurrentUser() user:AuthenticatedUser){return this.service.validate(id,user);}
  @Post(':id/cancel') cancel(@Param('id') id:string,@Body() body:CancelJsaDraftDto,@CurrentUser() user:AuthenticatedUser){return this.service.cancel(id,body.rowVersion,body.versionRowVersion,user);}
}
