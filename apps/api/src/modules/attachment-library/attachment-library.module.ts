import { Module } from '@nestjs/common';
import { AttachmentLibraryController } from './attachment-library.controller';
import { AttachmentLibraryService } from './application/attachment-library.service';
import { ATTACHMENT_LIBRARY_REPOSITORY } from './domain/attachment-library.repository';
import { FilesystemAttachmentStorage } from './infrastructure/filesystem-attachment-storage';
import { OracleAttachmentLibraryRepository } from './infrastructure/oracle-attachment-library.repository';

@Module({
  controllers: [AttachmentLibraryController],
  providers: [
    AttachmentLibraryService,
    FilesystemAttachmentStorage,
    OracleAttachmentLibraryRepository,
    {
      provide: ATTACHMENT_LIBRARY_REPOSITORY,
      useExisting: OracleAttachmentLibraryRepository,
    },
  ],
  exports: [AttachmentLibraryService],
})
export class AttachmentLibraryModule {}
