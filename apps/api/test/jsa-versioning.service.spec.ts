import { JsaVersioningService } from '../src/modules/jsa-versioning/application/jsa-versioning.service';

describe('JsaVersioningService Undo Checkout', () => {
  const user = {
    userId: '7',
    username: 'editor',
    displayName: 'JSA Editor',
    permissions: [],
  } as any;

  const create = (workingStatus: string) => {
    const repository = {
      master: jest.fn(async () => ({
        jsaId: '10',
        jsaNumber: 'PVD-I-DR-0001',
        siteId: '1',
        rigId: '2',
        departmentId: '3',
        currentVersionId: '100',
        currentStatus: 'PUBLISHED',
        workingVersionId: '101',
        workingStatus,
        baseVersionId: '100',
      })),
      hasPendingTask: jest.fn(async () => false),
      undo: jest.fn(async () => undefined),
    };
    const audit = { recordRequired: jest.fn(async () => undefined) };
    const service = new JsaVersioningService(
      {
        withTransaction: jest.fn(async (handler) => handler({ connection: {} })),
      } as any,
      repository as any,
      { require: jest.fn(), state: jest.fn() } as any,
      {} as any,
      { allows: jest.fn(() => true) } as any,
      { get: jest.fn(() => undefined) } as any,
      audit as any,
    );
    return { service, repository, audit };
  };

  it('cancels the unsubmitted Working Version and releases its checkout pointer', async () => {
    const { service, repository, audit } = create('DRAFT');

    await expect(service.undoCheckout('10', 'No longer required', user)).resolves.toEqual({
      jsaId: '10',
      status: 'PUBLISHED',
    });

    expect(repository.undo).toHaveBeenCalledWith(
      expect.objectContaining({ connection: {} }),
      expect.objectContaining({
        workingVersionId: '101',
        baseVersionId: '100',
      }),
      'editor',
    );
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCode: 'JSA_REVISION_CHECKOUT_UNDONE',
        nextState: { reason: 'No longer required' },
      }),
    );
  });

  it('rejects Undo Checkout after the Working Version has entered workflow', async () => {
    const { service, repository } = create('RETURNED');

    await expect(service.undoCheckout('10', undefined, user)).rejects.toThrow(
      'Undo Checkout is allowed only before submission',
    );
    expect(repository.undo).not.toHaveBeenCalled();
  });
});
