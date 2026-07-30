import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthenticatedUser } from '@jsams/shared-types';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AttachmentLibraryService,
  type UploadedFile as FileValue,
} from './application/attachment-library.service';
import {
  AttachmentScopeQueryDto,
  CreateAttachmentFolderDto,
  UploadAttachmentAssetDto,
} from './dto/attachment-library.dto';

@Controller('attachment-library')
@UseGuards(EnterpriseAuthGuard)
export class AttachmentLibraryController {
  constructor(private readonly service: AttachmentLibraryService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('ATTACHMENT_LIBRARY_ADMIN')
  list(@Query() query: AttachmentScopeQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, query.folderId, user);
  }

  @Get('picker')
  picker(@Query() query: AttachmentScopeQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.picker(query, user);
  }

  @Post('folders')
  @UseGuards(PermissionGuard)
  @RequirePermissions('ATTACHMENT_LIBRARY_ADMIN')
  createFolder(@Body() body: CreateAttachmentFolderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createFolder(body, user);
  }

  @Post('folders/:folderId/assets')
  @UseGuards(PermissionGuard)
  @RequirePermissions('ATTACHMENT_LIBRARY_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 52_428_800, files: 1 } }))
  upload(
    @Param('folderId') folderId: string,
    @Body() body: UploadAttachmentAssetDto,
    @UploadedFile() file: FileValue | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.upload(folderId, body, file, user);
  }

  @Post('assets/:assetId/versions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('ATTACHMENT_LIBRARY_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 52_428_800, files: 1 } }))
  replace(
    @Param('assetId') assetId: string,
    @UploadedFile() file: FileValue | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.replace(assetId, file, user);
  }

  @Get('versions/:versionId/download')
  async download(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.service.download(versionId, user);
    const fileName = download.asset.originalFileName.replace(/["\r\n]/g, '_');
    response.setHeader('Content-Type', download.asset.contentType);
    response.setHeader('Content-Length', download.asset.fileSize);
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(download.stream);
  }
}
