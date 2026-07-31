import { OracleJsaTranslationRepository } from '../src/modules/jsa-translation/infrastructure/oracle-jsa-translation.repository';

describe('OracleJsaTranslationRepository', () => {
  const fullSource = {
    jsaId: '1000110',
    versionId: '1000115',
    currentVersionId: '1000115',
    jsaNumber: 'PV DRILLING I-CAT-0001.1',
    versionNumber: 2,
    versionStatus: 'PUBLISHED',
    lifecycleStatus: 'PUBLISHED',
    sourceLanguageId: '1000000',
    sourceLanguageCode: 'EN',
    siteId: '1000000',
    rigId: '1000000',
    departmentId: '1000008',
  };

  it.each([
    { lock: false, lockClause: false },
    { lock: true, lockClause: true },
  ])(
    'binds the source JSA identifier with the Oracle-safe id bind when lock=$lock',
    async ({ lock, lockClause }) => {
      const execute = jest.fn().mockResolvedValue({ rows: [] });
      const repository = new OracleJsaTranslationRepository();

      await repository.source({ connection: { execute } } as never, '1000110', lock);

      expect(execute).toHaveBeenCalledTimes(1);
      const [sql, binds] = execute.mock.calls[0] as [string, Record<string, string>];
      expect(sql).toContain('WHERE M.JSA_ID=:id');
      expect(sql.includes('FOR UPDATE OF M.ROW_VERSION')).toBe(lockClause);
      expect(sql).not.toContain(':jsaId');
      expect(binds).toEqual({ id: '1000110' });
    },
  );

  it('binds only role lookup fields when given a full Translation source object', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [{ ITEM_COUNT: 1 }] });
    const repository = new OracleJsaTranslationRepository();

    await repository.actorHasWorkflowRole(
      { connection: { execute } } as never,
      '1000001',
      'OIM',
      fullSource,
    );

    expect(execute.mock.calls[0]?.[1]).toEqual({
      userId: '1000001',
      roleCode: 'OIM',
      siteId: '1000000',
      rigId: '1000000',
      departmentId: '1000008',
    });
  });

  it('binds only candidate lookup fields when given a full Translation source object', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new OracleJsaTranslationRepository();

    await repository.candidates(
      { connection: { execute } } as never,
      'TRANSLATOR',
      'DEV_JSA_TRANSLATE',
      fullSource,
    );

    expect(execute.mock.calls[0]?.[1]).toEqual({
      roleCode: 'TRANSLATOR',
      permissionCode: 'DEV_JSA_TRANSLATE',
      siteId: '1000000',
      rigId: '1000000',
      departmentId: '1000008',
    });
  });

  it('builds the Task segment from the authored VARCHAR2 title instead of the legacy CLOB', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new OracleJsaTranslationRepository();

    await repository.segmentSeeds({ connection: { execute } } as never, '1000115');

    const sql = execute.mock.calls[0]?.[0] as string;
    expect(sql).toContain("SELECT 'TASK',T.VERSION_TASK_ID,TO_CHAR(T.LOGICAL_KEY),'TITLE','TASKS'");
    expect(sql).toContain("'Y',T.TASK_TITLE");
    expect(sql).not.toContain('T.TASK_DESCRIPTION');
    expect(sql).not.toContain("'MATRIX'");
    expect(sql).not.toContain("'CODE','PROMPTS'");
    expect(sql).not.toContain("SELECT 'PROMPT'");
    expect(sql).not.toContain("'PERFORMER'");
    expect(sql).not.toContain("'SUPERVISOR'");
    expect(sql).not.toContain("'TOOL'");
    expect(execute.mock.calls[0]?.[1]).toEqual({ versionId: '1000115' });
  });

  it('casts the publisher user bind to NUMBER in the Publish CASE expression', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ rows: [{ ID: '1000999', TRANSLATED_TEXT: 'Translated text' }] });
    const repository = new OracleJsaTranslationRepository();

    await repository.review(
      { connection: { execute } } as never,
      {
        translationId: '1000100',
        status: 'STC_REVIEW',
        cycleNumber: 1,
        translatorUserId: '1000001',
        assignedByUserId: '1000002',
      } as never,
      'PUBLISH',
      'Approved',
      {
        userId: '1000003',
        username: 'stc.user',
        displayName: 'STC User',
      },
      'correlation-id',
    );

    const updateCall = execute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE JSA_TRANSLATION SET'),
    ) as [string, Record<string, unknown>] | undefined;
    expect(updateCall?.[0]).toContain('THEN TO_NUMBER(:actorId) ELSE PUBLISHED_BY_USER_ID');
    expect(updateCall?.[1]).toMatchObject({ actorId: '1000003', next: 'PUBLISHED' });
  });

  it('lists only Published translations for the current JSA version and scoped user', async () => {
    const execute = jest.fn().mockResolvedValue({
      rows: [
        {
          TRANSLATION_ID: '1000100',
          TARGET_LANGUAGE_CODE: 'VI',
          TARGET_LANGUAGE_NAME: 'Vietnamese',
          VERSION_NUMBER: 3,
          PUBLISHED_AT: new Date('2026-07-31T00:00:00.000Z'),
        },
      ],
    });
    const repository = new OracleJsaTranslationRepository();

    const result = await repository.publishedForJsa(
      { connection: { execute } } as never,
      '1000110',
      '1000001',
    );

    const [sql, binds] = execute.mock.calls[0] as [string, Record<string, string>];
    expect(sql).toContain("T.TRANSLATION_STATUS='PUBLISHED'");
    expect(sql).toContain('M.CURRENT_VERSION_ID=T.SOURCE_JSA_VERSION_ID');
    expect(sql).toContain("DS.CAN_VIEW='Y'");
    expect(binds).toEqual({ jsaId: '1000110', userId: '1000001' });
    expect(result).toEqual([
      expect.objectContaining({
        translationId: '1000100',
        targetLanguageCode: 'VI',
        targetLanguageName: 'Vietnamese',
      }),
    ]);
  });
});
