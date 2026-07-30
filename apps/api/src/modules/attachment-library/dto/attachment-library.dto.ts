import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const id = /^\d{1,19}$/;

export class AttachmentScopeQueryDto {
  @Matches(id) siteId!: string;
  @Matches(id) rigId!: string;
  @Matches(id) departmentId!: string;
  @IsOptional() @Matches(id) folderId?: string;
}

export class CreateAttachmentFolderDto {
  @Matches(id) siteId!: string;
  @Matches(id) rigId!: string;
  @Matches(id) departmentId!: string;
  @IsOptional() @Matches(id) parentFolderId?: string;
  @IsString() @MaxLength(200) name!: string;
}

export class UploadAttachmentAssetDto {
  @IsString() @MaxLength(500) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
