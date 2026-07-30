import type { AttachmentLibraryAsset, AttachmentLibraryFolder } from '@jsams/shared-types';

export interface AttachmentScope {
  siteId: string;
  rigId: string;
  departmentId: string;
}

export interface CreateFolderInput extends AttachmentScope {
  parentFolderId?: string;
  name: string;
}

export interface UploadAssetInput {
  folderId: string;
  name: string;
  description?: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  sha256: string;
  storageKey: string;
}

export interface AttachmentDownload {
  asset: AttachmentLibraryAsset;
  scope: AttachmentScope;
  storageKey: string;
}

export type { AttachmentLibraryAsset, AttachmentLibraryFolder };
