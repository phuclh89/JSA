import { mapDraftAttachmentRow } from './oracle-jsa-draft.repository';

describe('OracleJsaDraftRepository attachment mapping', () => {
  it('returns the immutable library version identifier needed after submission', () => {
    expect(
      mapDraftAttachmentRow({
        ID: '301',
        LOGICAL_KEY: '301',
        LIBRARY_ASSET_VERSION_ID: '9001',
        FILE_NAME: 'cleaning-procedure.pdf',
        CONTENT_TYPE: 'application/pdf',
        FILE_SIZE: '1024',
        STORAGE_KEY: '1/2/3/cleaning-procedure.pdf',
        ATTACHMENT_STATUS: 'STORED',
        DESCRIPTION: 'Approved cleaning procedure',
        ROW_VERSION: '1',
      }),
    ).toEqual({
      id: '301',
      logicalKey: '301',
      libraryAssetVersionId: '9001',
      fileName: 'cleaning-procedure.pdf',
      contentType: 'application/pdf',
      fileSize: '1024',
      storageKey: '1/2/3/cleaning-procedure.pdf',
      status: 'STORED',
      description: 'Approved cleaning procedure',
      rowVersion: '1',
    });
  });
});
