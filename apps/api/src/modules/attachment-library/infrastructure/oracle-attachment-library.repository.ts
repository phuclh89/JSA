import { Injectable } from '@nestjs/common';
import oracledb from 'oracledb';
import type { AttachmentLibraryAsset, AttachmentLibraryFolder } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { AttachmentLibraryRepository } from '../domain/attachment-library.repository';
import type {
  AttachmentDownload,
  AttachmentScope,
  CreateFolderInput,
  UploadAssetInput,
} from '../domain/attachment-library.types';

type Row = Record<string, string | number | null>;
const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };

@Injectable()
export class OracleAttachmentLibraryRepository implements AttachmentLibraryRepository {
  async folders(context: OracleTransactionContext, scope: AttachmentScope) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(ATTACHMENT_FOLDER_ID) ID,TO_CHAR(SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID,
              TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID,TO_CHAR(PARENT_FOLDER_ID) PARENT_FOLDER_ID,
              FOLDER_NAME,IS_ACTIVE,TO_CHAR(ROW_VERSION) ROW_VERSION
       FROM JSA_ATTACHMENT_FOLDER
       WHERE SITE_ID=:siteId AND RIG_ID=:rigId AND DEPARTMENT_ID=:departmentId
       ORDER BY UPPER(FOLDER_NAME),ATTACHMENT_FOLDER_ID`,
      { ...scope },
      opts,
    );
    return (result.rows ?? []).map(mapFolder);
  }

  async assets(context: OracleTransactionContext, scope: AttachmentScope, folderId?: string) {
    const folderFilter = folderId ? ' AND A.ATTACHMENT_FOLDER_ID=:folderId' : '';
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(A.ATTACHMENT_ASSET_ID) ID,TO_CHAR(A.ATTACHMENT_FOLDER_ID) FOLDER_ID,
              A.ASSET_NAME,A.DESCRIPTION,TO_CHAR(A.CURRENT_VERSION_ID) CURRENT_VERSION_ID,
              V.VERSION_NUMBER,V.ORIGINAL_FILE_NAME,V.CONTENT_TYPE,TO_CHAR(V.FILE_SIZE) FILE_SIZE,
              V.CONTENT_SHA256,A.IS_ACTIVE,TO_CHAR(A.ROW_VERSION) ROW_VERSION
       FROM JSA_ATTACHMENT_ASSET A
       JOIN JSA_ATTACHMENT_FOLDER F ON F.ATTACHMENT_FOLDER_ID=A.ATTACHMENT_FOLDER_ID
       JOIN JSA_ATTACHMENT_ASSET_VERSION V ON V.ATTACHMENT_ASSET_VERSION_ID=A.CURRENT_VERSION_ID
       WHERE F.SITE_ID=:siteId AND F.RIG_ID=:rigId AND F.DEPARTMENT_ID=:departmentId
         ${folderFilter}
       ORDER BY UPPER(A.ASSET_NAME),A.ATTACHMENT_ASSET_ID`,
      folderId ? { ...scope, folderId } : { ...scope },
      opts,
    );
    return (result.rows ?? []).map(mapAsset);
  }

  async createFolder(context: OracleTransactionContext, input: CreateFolderInput, actor: string) {
    const id = await this.next(context, 'SEQ_JSA_ATTACHMENT_FOLDER');
    await context.connection.execute(
      `INSERT INTO JSA_ATTACHMENT_FOLDER
       (ATTACHMENT_FOLDER_ID,SITE_ID,RIG_ID,DEPARTMENT_ID,PARENT_FOLDER_ID,FOLDER_NAME,
        CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
       VALUES(:id,:siteId,:rigId,:departmentId,:parentFolderId,:name,:siteId,:siteId,:actor,:actor)`,
      { id, ...input, parentFolderId: input.parentFolderId ?? null, actor },
    );
    return {
      id,
      siteId: input.siteId,
      rigId: input.rigId,
      departmentId: input.departmentId,
      ...(input.parentFolderId ? { parentFolderId: input.parentFolderId } : {}),
      name: input.name,
      active: true,
      rowVersion: '1',
    } satisfies AttachmentLibraryFolder;
  }

  async folderScope(context: OracleTransactionContext, folderId: string) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(SITE_ID) SITE_ID,TO_CHAR(RIG_ID) RIG_ID,TO_CHAR(DEPARTMENT_ID) DEPARTMENT_ID,IS_ACTIVE
       FROM JSA_ATTACHMENT_FOLDER WHERE ATTACHMENT_FOLDER_ID=:folderId`,
      { folderId },
      opts,
    );
    const row = result.rows?.[0];
    return row
      ? {
          siteId: String(row.SITE_ID),
          rigId: String(row.RIG_ID),
          departmentId: String(row.DEPARTMENT_ID),
          active: row.IS_ACTIVE === 'Y',
        }
      : undefined;
  }

  async assetScope(context: OracleTransactionContext, assetId: string) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(F.SITE_ID) SITE_ID,TO_CHAR(F.RIG_ID) RIG_ID,
              TO_CHAR(F.DEPARTMENT_ID) DEPARTMENT_ID,A.IS_ACTIVE
       FROM JSA_ATTACHMENT_ASSET A
       JOIN JSA_ATTACHMENT_FOLDER F ON F.ATTACHMENT_FOLDER_ID=A.ATTACHMENT_FOLDER_ID
       WHERE A.ATTACHMENT_ASSET_ID=:assetId`,
      { assetId },
      opts,
    );
    const row = result.rows?.[0];
    return row
      ? {
          siteId: String(row.SITE_ID),
          rigId: String(row.RIG_ID),
          departmentId: String(row.DEPARTMENT_ID),
          active: row.IS_ACTIVE === 'Y',
        }
      : undefined;
  }

  async createAsset(
    context: OracleTransactionContext,
    input: UploadAssetInput,
    actor: string,
    createdSiteId: string,
  ) {
    const assetId = await this.next(context, 'SEQ_JSA_ATTACHMENT_ASSET');
    const versionId = await this.next(context, 'SEQ_JSA_ATTACHMENT_VERSION');
    await context.connection.execute(
      `INSERT INTO JSA_ATTACHMENT_ASSET
       (ATTACHMENT_ASSET_ID,ATTACHMENT_FOLDER_ID,ASSET_NAME,DESCRIPTION,CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
       VALUES(:assetId,:folderId,:name,:description,:siteId,:siteId,:actor,:actor)`,
      {
        assetId,
        folderId: input.folderId,
        name: input.name,
        description: input.description ?? null,
        siteId: createdSiteId,
        actor,
      },
    );
    await this.insertVersion(context, versionId, assetId, 1, input, actor, createdSiteId);
    await context.connection.execute(
      `UPDATE JSA_ATTACHMENT_ASSET SET CURRENT_VERSION_ID=:versionId WHERE ATTACHMENT_ASSET_ID=:assetId`,
      { versionId, assetId },
    );
    return {
      id: assetId,
      folderId: input.folderId,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      currentVersionId: versionId,
      versionNumber: 1,
      originalFileName: input.originalFileName,
      contentType: input.contentType,
      fileSize: String(input.fileSize),
      sha256: input.sha256,
      active: true,
      rowVersion: '1',
    } satisfies AttachmentLibraryAsset;
  }

  async replaceAsset(
    context: OracleTransactionContext,
    assetId: string,
    input: Omit<UploadAssetInput, 'folderId' | 'name' | 'description'>,
    actor: string,
    createdSiteId: string,
  ) {
    const locked = await context.connection.execute<Row>(
      `SELECT TO_CHAR(A.ATTACHMENT_FOLDER_ID) FOLDER_ID,A.ASSET_NAME,A.DESCRIPTION,A.IS_ACTIVE,
              (SELECT NVL(MAX(V.VERSION_NUMBER),0)
               FROM JSA_ATTACHMENT_ASSET_VERSION V
               WHERE V.ATTACHMENT_ASSET_ID=A.ATTACHMENT_ASSET_ID) LAST_VERSION
       FROM JSA_ATTACHMENT_ASSET A
       WHERE A.ATTACHMENT_ASSET_ID=:assetId
       FOR UPDATE`,
      { assetId },
      opts,
    );
    const row = locked.rows?.[0];
    if (!row || row.IS_ACTIVE !== 'Y') return undefined;
    const versionNumber = Number(row.LAST_VERSION) + 1;
    const versionId = await this.next(context, 'SEQ_JSA_ATTACHMENT_VERSION');
    await this.insertVersion(
      context,
      versionId,
      assetId,
      versionNumber,
      input,
      actor,
      createdSiteId,
    );
    await context.connection.execute(
      `UPDATE JSA_ATTACHMENT_ASSET
       SET CURRENT_VERSION_ID=:versionId,UPDATED_AT=SYSTIMESTAMP,UPDATED_BY=:actor,
           UPDATED_SITE_ID=:siteId,ROW_VERSION=ROW_VERSION+1
       WHERE ATTACHMENT_ASSET_ID=:assetId`,
      { versionId, actor, siteId: createdSiteId, assetId },
    );
    return {
      id: assetId,
      folderId: String(row.FOLDER_ID),
      name: String(row.ASSET_NAME),
      ...(row.DESCRIPTION ? { description: String(row.DESCRIPTION) } : {}),
      currentVersionId: versionId,
      versionNumber,
      originalFileName: input.originalFileName,
      contentType: input.contentType,
      fileSize: String(input.fileSize),
      sha256: input.sha256,
      active: true,
      rowVersion: '2',
    } satisfies AttachmentLibraryAsset;
  }

  async download(context: OracleTransactionContext, versionId: string) {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(A.ATTACHMENT_ASSET_ID) ID,TO_CHAR(A.ATTACHMENT_FOLDER_ID) FOLDER_ID,
              A.ASSET_NAME,A.DESCRIPTION,TO_CHAR(A.CURRENT_VERSION_ID) CURRENT_VERSION_ID,
              V.VERSION_NUMBER,V.ORIGINAL_FILE_NAME,V.CONTENT_TYPE,TO_CHAR(V.FILE_SIZE) FILE_SIZE,
              V.CONTENT_SHA256,V.STORAGE_KEY,A.IS_ACTIVE,TO_CHAR(A.ROW_VERSION) ROW_VERSION,
              TO_CHAR(F.SITE_ID) SITE_ID,TO_CHAR(F.RIG_ID) RIG_ID,TO_CHAR(F.DEPARTMENT_ID) DEPARTMENT_ID
       FROM JSA_ATTACHMENT_ASSET_VERSION V
       JOIN JSA_ATTACHMENT_ASSET A ON A.ATTACHMENT_ASSET_ID=V.ATTACHMENT_ASSET_ID
       JOIN JSA_ATTACHMENT_FOLDER F ON F.ATTACHMENT_FOLDER_ID=A.ATTACHMENT_FOLDER_ID
       WHERE V.ATTACHMENT_ASSET_VERSION_ID=:versionId AND V.STORAGE_STATUS='STORED'`,
      { versionId },
      opts,
    );
    const row = result.rows?.[0];
    if (!row) return undefined;
    return {
      asset: mapAsset(row),
      scope: {
        siteId: String(row.SITE_ID),
        rigId: String(row.RIG_ID),
        departmentId: String(row.DEPARTMENT_ID),
      },
      storageKey: String(row.STORAGE_KEY),
    } satisfies AttachmentDownload;
  }

  private async insertVersion(
    context: OracleTransactionContext,
    versionId: string,
    assetId: string,
    versionNumber: number,
    input: Omit<UploadAssetInput, 'folderId' | 'name' | 'description'>,
    actor: string,
    siteId: string,
  ) {
    await context.connection.execute(
      `INSERT INTO JSA_ATTACHMENT_ASSET_VERSION
       (ATTACHMENT_ASSET_VERSION_ID,ATTACHMENT_ASSET_ID,VERSION_NUMBER,ORIGINAL_FILE_NAME,
        CONTENT_TYPE,FILE_SIZE,CONTENT_SHA256,STORAGE_KEY,CREATED_SITE_ID,CREATED_BY)
       VALUES(:versionId,:assetId,:versionNumber,:originalFileName,:contentType,:fileSize,:sha256,:storageKey,:siteId,:actor)`,
      {
        versionId,
        assetId,
        versionNumber,
        originalFileName: input.originalFileName,
        contentType: input.contentType,
        fileSize: input.fileSize,
        sha256: input.sha256,
        storageKey: input.storageKey,
        siteId,
        actor,
      },
    );
  }

  private async next(context: OracleTransactionContext, sequence: string): Promise<string> {
    const result = await context.connection.execute<Row>(
      `SELECT TO_CHAR(${sequence}.NEXTVAL) ID FROM DUAL`,
      {},
      opts,
    );
    return String(result.rows?.[0]?.ID);
  }
}

function mapFolder(row: Row): AttachmentLibraryFolder {
  return {
    id: String(row.ID),
    siteId: String(row.SITE_ID),
    rigId: String(row.RIG_ID),
    departmentId: String(row.DEPARTMENT_ID),
    ...(row.PARENT_FOLDER_ID ? { parentFolderId: String(row.PARENT_FOLDER_ID) } : {}),
    name: String(row.FOLDER_NAME),
    active: row.IS_ACTIVE === 'Y',
    rowVersion: String(row.ROW_VERSION),
  };
}

function mapAsset(row: Row): AttachmentLibraryAsset {
  return {
    id: String(row.ID),
    folderId: String(row.FOLDER_ID),
    name: String(row.ASSET_NAME),
    ...(row.DESCRIPTION ? { description: String(row.DESCRIPTION) } : {}),
    currentVersionId: String(row.CURRENT_VERSION_ID),
    versionNumber: Number(row.VERSION_NUMBER),
    originalFileName: String(row.ORIGINAL_FILE_NAME),
    contentType: String(row.CONTENT_TYPE),
    fileSize: String(row.FILE_SIZE),
    sha256: String(row.CONTENT_SHA256),
    active: row.IS_ACTIVE === 'Y',
    rowVersion: String(row.ROW_VERSION),
  };
}
