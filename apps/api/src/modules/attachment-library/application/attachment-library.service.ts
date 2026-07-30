import { createHash } from 'node:crypto';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  DuplicateConflictError,
  ResourceNotFoundError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { assertOracleId } from '../../../common/oracle/oracle-id';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import {
  ATTACHMENT_LIBRARY_REPOSITORY,
  type AttachmentLibraryRepository,
} from '../domain/attachment-library.repository';
import type { AttachmentScope, CreateFolderInput } from '../domain/attachment-library.types';
import { FilesystemAttachmentStorage } from '../infrastructure/filesystem-attachment-storage';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const contentTypes: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/octet-stream'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ],
  '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ],
  '.ppt': ['application/vnd.ms-powerpoint', 'application/octet-stream'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/octet-stream',
  ],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};

@Injectable()
export class AttachmentLibraryService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(ATTACHMENT_LIBRARY_REPOSITORY)
    private readonly repository: AttachmentLibraryRepository,
    private readonly storage: FilesystemAttachmentStorage,
    private readonly scopes: DataScopeService,
    private readonly config: ConfigService,
    private readonly audit: SecurityAuditService,
  ) {}

  async list(scope: AttachmentScope, folderId: string | undefined, user: AuthenticatedUser) {
    const governedScope = this.governedScope(scope);
    this.assertScope(governedScope, user, 'VIEW');
    if (folderId) assertOracleId(folderId, 'folderId');
    return this.oracle.withTransaction(async (context) => ({
      folders: await this.repository.folders(context, governedScope),
      assets: await this.repository.assets(context, governedScope, folderId),
    }));
  }

  async picker(scope: AttachmentScope, user: AuthenticatedUser) {
    const governedScope = this.governedScope(scope);
    this.assertScope(governedScope, user, 'VIEW');
    return this.oracle.withTransaction(async (context) => {
      const [folders, assets] = await Promise.all([
        this.repository.folders(context, governedScope),
        this.repository.assets(context, governedScope),
      ]);
      return {
        folders: folders.filter((item) => item.active),
        assets: assets.filter((item) => item.active),
      };
    });
  }

  async createFolder(input: CreateFolderInput, user: AuthenticatedUser) {
    this.assertScope(input, user, 'ACT');
    const name = input.name.trim();
    if (
      !name ||
      /[<>:"/\\|?*]/.test(name) ||
      Array.from(name).some((character) => character.charCodeAt(0) < 32)
    )
      throw new ValidationError('Folder name contains unsupported characters');
    if (input.parentFolderId) assertOracleId(input.parentFolderId, 'parentFolderId');
    try {
      const created = await this.oracle.withTransaction((context) =>
        this.repository.createFolder(context, { ...input, name }, user.username),
      );
      await this.audit.recordRequired({
        actorUserId: user.userId,
        enterpriseUsername: user.username,
        actionCode: 'ATTACHMENT_FOLDER_CREATED',
        targetType: 'JSA_ATTACHMENT_FOLDER',
        targetId: created.id,
        siteId: input.siteId,
        rigId: input.rigId,
        nextState: created,
      });
      return created;
    } catch (error) {
      if ((error as { errorNum?: number }).errorNum === 1)
        throw new DuplicateConflictError('A folder with this name already exists');
      throw error;
    }
  }

  async upload(
    folderId: string,
    input: { name: string; description?: string },
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
  ) {
    assertOracleId(folderId, 'folderId');
    const scope = await this.folderScope(folderId, user);
    if (!file) throw new ValidationError('A file is required');
    this.validateFile(file);
    const storageKey = this.storage.createKey(scope, file.originalname);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer);
    try {
      const created = await this.oracle.withTransaction((context) =>
        this.repository.createAsset(
          context,
          {
            folderId,
            name: input.name.trim() || file.originalname,
            description: input.description?.trim(),
            originalFileName: path.basename(file.originalname),
            contentType: file.mimetype,
            fileSize: file.size,
            sha256,
            storageKey,
          },
          user.username,
          scope.siteId,
        ),
      );
      await this.auditAsset('ATTACHMENT_ASSET_UPLOADED', created.id, scope, user);
      return created;
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async replace(assetId: string, file: UploadedFile | undefined, user: AuthenticatedUser) {
    assertOracleId(assetId, 'assetId');
    if (!file) throw new ValidationError('A replacement file is required');
    this.validateFile(file);
    const scope = await this.assetScope(assetId, user);
    const storageKey = this.storage.createKey(scope, file.originalname);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer);
    try {
      const replaced = await this.oracle.withTransaction((context) =>
        this.repository.replaceAsset(
          context,
          assetId,
          {
            originalFileName: path.basename(file.originalname),
            contentType: file.mimetype,
            fileSize: file.size,
            sha256,
            storageKey,
          },
          user.username,
          scope.siteId,
        ),
      );
      if (!replaced) throw new ResourceNotFoundError();
      await this.auditAsset('ATTACHMENT_ASSET_REPLACED', replaced.id, scope, user);
      return replaced;
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(versionId: string, user: AuthenticatedUser) {
    assertOracleId(versionId, 'versionId');
    const record = await this.oracle.withTransaction((context) =>
      this.repository.download(context, versionId),
    );
    if (!record) throw new ResourceNotFoundError();
    this.assertScope(record.scope, user, 'VIEW');
    return { ...record, stream: this.storage.open(record.storageKey) };
  }

  private async folderScope(folderId: string, user: AuthenticatedUser) {
    const folder = await this.oracle.withTransaction((context) =>
      this.repository.folderScope(context, folderId),
    );
    if (!folder || !folder.active) throw new ResourceNotFoundError('Active folder was not found');
    this.assertScope(folder, user, 'ACT');
    return folder;
  }

  private async assetScope(assetId: string, user: AuthenticatedUser): Promise<AttachmentScope> {
    const asset = await this.oracle.withTransaction((context) =>
      this.repository.assetScope(context, assetId),
    );
    if (!asset || !asset.active) throw new ResourceNotFoundError();
    this.assertScope(asset, user, 'ACT');
    return asset;
  }

  private validateFile(file: UploadedFile) {
    const extension = path.extname(file.originalname).toLowerCase();
    const accepted = contentTypes[extension];
    if (!accepted || !accepted.includes(file.mimetype))
      throw new ValidationError('File type is not allowed');
    const maximum = this.config.getOrThrow<number>('attachment.maxFileSizeBytes');
    if (file.size < 1 || file.size > maximum)
      throw new ValidationError(`File must be between 1 byte and ${maximum} bytes`);
  }

  private assertScope(scope: AttachmentScope, user: AuthenticatedUser, access: 'VIEW' | 'ACT') {
    assertOracleId(scope.siteId, 'siteId');
    assertOracleId(scope.rigId, 'rigId');
    assertOracleId(scope.departmentId, 'departmentId');
    if (!this.scopes.allows(user, { scopeType: 'DEPARTMENT', ...scope }, access))
      throw new DataScopeDeniedError();
  }

  private governedScope(scope: AttachmentScope): AttachmentScope {
    return {
      siteId: scope.siteId,
      rigId: scope.rigId,
      departmentId: scope.departmentId,
    };
  }

  private auditAsset(
    actionCode: string,
    targetId: string,
    scope: AttachmentScope,
    user: AuthenticatedUser,
  ) {
    return this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode,
      targetType: 'JSA_ATTACHMENT_ASSET',
      targetId,
      siteId: scope.siteId,
      rigId: scope.rigId,
    });
  }
}
