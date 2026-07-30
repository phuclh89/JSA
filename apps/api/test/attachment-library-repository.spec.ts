import { OracleAttachmentLibraryRepository } from '../src/modules/attachment-library/infrastructure/oracle-attachment-library.repository';

describe('OracleAttachmentLibraryRepository', () => {
  const scope = { siteId: '1', rigId: '2', departmentId: '3' };

  it('does not pass an unused folderId bind when listing the whole governed scope', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new OracleAttachmentLibraryRepository();

    await repository.assets({ connection: { execute } as never }, scope);

    expect(execute).toHaveBeenCalledWith(
      expect.not.stringContaining(':folderId'),
      scope,
      expect.anything(),
    );
  });

  it('adds the folder bind only when filtering by one folder', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new OracleAttachmentLibraryRepository();

    await repository.assets({ connection: { execute } as never }, scope, '4');

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('A.ATTACHMENT_FOLDER_ID=:folderId'),
      { ...scope, folderId: '4' },
      expect.anything(),
    );
  });
});
