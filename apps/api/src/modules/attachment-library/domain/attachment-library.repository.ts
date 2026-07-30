import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type {
  AttachmentDownload,
  AttachmentLibraryAsset,
  AttachmentLibraryFolder,
  AttachmentScope,
  CreateFolderInput,
  UploadAssetInput,
} from './attachment-library.types';

export const ATTACHMENT_LIBRARY_REPOSITORY = Symbol('ATTACHMENT_LIBRARY_REPOSITORY');

export interface AttachmentLibraryRepository {
  folders(
    context: OracleTransactionContext,
    scope: AttachmentScope,
  ): Promise<AttachmentLibraryFolder[]>;
  assets(
    context: OracleTransactionContext,
    scope: AttachmentScope,
    folderId?: string,
  ): Promise<AttachmentLibraryAsset[]>;
  createFolder(
    context: OracleTransactionContext,
    input: CreateFolderInput,
    actor: string,
  ): Promise<AttachmentLibraryFolder>;
  folderScope(
    context: OracleTransactionContext,
    folderId: string,
  ): Promise<(AttachmentScope & { active: boolean }) | undefined>;
  assetScope(
    context: OracleTransactionContext,
    assetId: string,
  ): Promise<(AttachmentScope & { active: boolean }) | undefined>;
  createAsset(
    context: OracleTransactionContext,
    input: UploadAssetInput,
    actor: string,
    createdSiteId: string,
  ): Promise<AttachmentLibraryAsset>;
  replaceAsset(
    context: OracleTransactionContext,
    assetId: string,
    input: Omit<UploadAssetInput, 'folderId' | 'name' | 'description'>,
    actor: string,
    createdSiteId: string,
  ): Promise<AttachmentLibraryAsset | undefined>;
  download(
    context: OracleTransactionContext,
    versionId: string,
  ): Promise<AttachmentDownload | undefined>;
}
