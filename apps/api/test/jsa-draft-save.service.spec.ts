import { JsaDraftService } from '../src/modules/jsa-draft/application/jsa-draft.service';

describe('JsaDraftService aggregate save', () => {
  it('updates Header and Content in one transaction with consecutive Version row values', async () => {
    const transactionContext = { connection: {} };
    const oracle = {
      withTransaction: jest.fn(async (work: (context: unknown) => unknown) =>
        work(transactionContext),
      ),
    };
    const access = {
      jsaId: '1',
      versionId: '2',
      siteId: '3',
      rigId: '4',
      departmentId: '5',
      creatorUserId: '6',
      status: 'DRAFT',
      versionStatus: 'DRAFT',
      rowVersion: '7',
      versionRowVersion: '8',
    };
    const repository = {
      access: jest.fn().mockResolvedValue(access),
      updateHeader: jest.fn().mockResolvedValue(undefined),
      saveContent: jest.fn().mockResolvedValue(undefined),
    };
    const capabilities = {
      require: jest.fn(),
      capabilities: jest.fn().mockReturnValue({ edit: true }),
    };
    const scopes = { allows: jest.fn().mockReturnValue(true) };
    const validation = { structural: jest.fn() };
    const audit = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const service = new JsaDraftService(
      oracle as never,
      repository as never,
      capabilities as never,
      scopes as never,
      {} as never,
      {} as never,
      {} as never,
      validation as never,
      audit as never,
    );
    jest.spyOn(service, 'detail').mockResolvedValue({} as never);

    await service.saveDraft(
      '1',
      {
        rowVersion: '7',
        versionRowVersion: '8',
        jobTitle: 'Updated JSA',
        prompts: [],
        tasks: [],
        coverage: [{ ref: 'legacy', promptRef: 'prompt', hazardRef: 'hazard' }],
        basicSteps: [],
        procedureReferences: [
          {
            ref: 'legacy-procedure',
            procedureReferenceId: '10',
            code: 'LEGACY',
            displayOrder: 1,
          },
        ],
        attachments: [],
      },
      {
        userId: '6',
        username: 'creator',
      } as never,
    );

    expect(oracle.withTransaction).toHaveBeenCalledTimes(1);
    expect(repository.updateHeader).toHaveBeenCalledWith(
      transactionContext,
      access,
      expect.objectContaining({ rowVersion: '7', versionRowVersion: '8' }),
      'creator',
    );
    expect(repository.saveContent).toHaveBeenCalledWith(
      transactionContext,
      access,
      expect.objectContaining({
        versionRowVersion: '9',
        coverage: [],
        procedureReferences: [],
      }),
      'creator',
    );
    expect(repository.updateHeader.mock.invocationCallOrder[0]).toBeLessThan(
      repository.saveContent.mock.invocationCallOrder[0]!,
    );
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'JSA_DRAFT_SAVED', targetId: '1' }),
    );
  });
});
