import { AttachmentLibraryService } from '../src/modules/attachment-library/application/attachment-library.service';

const scope = { siteId: '1', rigId: '2', departmentId: '3' };
const user = {
  userId: '9',
  username: 'admin',
  dataScopes: [
    {
      scopeType: 'DEPARTMENT',
      ...scope,
      canView: true,
      canAct: true,
    },
  ],
} as never;

describe('AttachmentLibraryService', () => {
  it('removes optional DTO properties before passing Oracle scope binds', async () => {
    const repository = {
      folders: jest.fn().mockResolvedValue([]),
      assets: jest.fn().mockResolvedValue([]),
    };
    const service = new AttachmentLibraryService(
      {
        withTransaction: jest.fn(async (work) => work({ connection: {} })),
      } as never,
      repository as never,
      {} as never,
      { allows: jest.fn().mockReturnValue(true) } as never,
      {} as never,
      {} as never,
    );

    await service.list({ ...scope, folderId: undefined } as never, undefined, user);

    expect(repository.folders).toHaveBeenCalledWith(expect.anything(), scope);
    expect(repository.assets).toHaveBeenCalledWith(expect.anything(), scope, undefined);
  });

  it('writes binary to the filesystem and persists only governed metadata', async () => {
    const repository = {
      folderScope: jest.fn().mockResolvedValue({ ...scope, active: true }),
      createAsset: jest.fn().mockResolvedValue({
        id: '10',
        folderId: '4',
        currentVersionId: '11',
      }),
    };
    const storage = {
      createKey: jest.fn().mockReturnValue('1/2/3/file-key.pdf'),
      put: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AttachmentLibraryService(
      {
        withTransaction: jest.fn(async (work) => work({ connection: {} })),
      } as never,
      repository as never,
      storage as never,
      { allows: jest.fn().mockReturnValue(true) } as never,
      { getOrThrow: jest.fn().mockReturnValue(52_428_800) } as never,
      { recordRequired: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.upload(
      '4',
      { name: 'Permit' },
      {
        originalname: 'permit.pdf',
        mimetype: 'application/pdf',
        size: 4,
        buffer: Buffer.from('test'),
      },
      user,
    );

    expect(storage.put).toHaveBeenCalledWith('1/2/3/file-key.pdf', expect.any(Buffer));
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        folderId: '4',
        storageKey: '1/2/3/file-key.pdf',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      'admin',
      '1',
    );
  });

  it('rejects executable uploads before writing any file', async () => {
    const storage = { put: jest.fn(), createKey: jest.fn() };
    const service = new AttachmentLibraryService(
      { withTransaction: jest.fn(async (work) => work({})) } as never,
      { folderScope: jest.fn().mockResolvedValue({ ...scope, active: true }) } as never,
      storage as never,
      { allows: jest.fn().mockReturnValue(true) } as never,
      { getOrThrow: jest.fn().mockReturnValue(52_428_800) } as never,
      {} as never,
    );
    await expect(
      service.upload(
        '4',
        { name: 'Bad' },
        {
          originalname: 'bad.exe',
          mimetype: 'application/octet-stream',
          size: 4,
          buffer: Buffer.from('test'),
        },
        user,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
