import { OracleJsaDraftRepository } from '../src/modules/jsa-draft/infrastructure/oracle-jsa-draft.repository';

describe('OracleJsaDraftRepository', () => {
  it('loads governed organization names with the immutable JSA ownership context', async () => {
    const execute = jest.fn(async (sql: string) => {
      if (sql.includes('JOIN SYS_SITE S ON S.SITE_ID=M.OWNER_SITE_ID')) {
        expect(sql).toContain('R.SITE_ID=M.OWNER_SITE_ID');
        expect(sql).toContain('D.RIG_ID=M.RIG_ID');
        return {
          rows: [
            {
              JSA_ID: '1',
              VERSION_ID: '2',
              JSA_NUMBER: 'DEV-1',
              LIFECYCLE_STATUS: 'DRAFT',
              VERSION_STATUS: 'DRAFT',
              OWNER_SITE_ID: '3',
              SITE_CODE: 'DEV',
              SITE_NAME: 'JSAMS Local Development',
              RIG_ID: '4',
              RIG_CODE: 'DEV-RIG',
              RIG_NAME: 'Development Rig',
              DEPARTMENT_ID: '5',
              DEPARTMENT_CODE: 'DRILL',
              DEPARTMENT_NAME: 'Drilling',
              MATRIX_VERSION_ID: '6',
              LANGUAGE_ID: '7',
              PTW_REQUIRED_FLAG: 'N',
              CREATOR_USER_ID: '8',
              ROW_VERSION: '1',
              VERSION_ROW_VERSION: '1',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const repository = new OracleJsaDraftRepository();

    const loaded = await repository.load({ connection: { execute } as never }, '1');

    expect(loaded?.header).toMatchObject({
      ownerSiteId: '3',
      ownerSiteCode: 'DEV',
      ownerSiteName: 'JSAMS Local Development',
      rigId: '4',
      rigCode: 'DEV-RIG',
      rigName: 'Development Rig',
      departmentId: '5',
      departmentCode: 'DRILL',
      departmentName: 'Drilling',
    });
  });

  it('lists only creator-owned Draft or Returned Working Versions in governed scope', async () => {
    const execute = jest.fn(async (sql: string, binds: Record<string, unknown>) => {
      expect(sql).toContain('M.CREATOR_USER_ID=:userId');
      expect(sql).toContain("V.VERSION_STATUS IN ('DRAFT','RETURNED')");
      expect(sql).toContain('V.JSA_VERSION_ID=M.WORKING_VERSION_ID');
      expect(sql).toContain('FROM SYS_USER_DATA_SCOPE DS');
      expect(binds).toEqual({ userId: '7' });
      return {
        rows: [
          {
            JSA_ID: '1',
            VERSION_ID: '2',
            JSA_NUMBER: 'DEV-1',
            JOB_TITLE: 'Test job',
            VERSION_STATUS: 'DRAFT',
            SITE_CODE: 'DEV',
            SITE_NAME: 'Development',
            RIG_CODE: 'DEV-RIG',
            RIG_NAME: 'Development Rig',
            DEPARTMENT_CODE: 'DRILL',
            DEPARTMENT_NAME: 'Drilling',
            UPDATED_AT: '2026-07-24T00:00:00.000Z',
          },
        ],
      };
    });
    const repository = new OracleJsaDraftRepository();

    await expect(repository.listMine({ connection: { execute } as never }, '7')).resolves.toEqual([
      expect.objectContaining({
        jsaId: '1',
        versionId: '2',
        jsaNumber: 'DEV-1',
        versionStatus: 'DRAFT',
        ownerSiteCode: 'DEV',
        rigCode: 'DEV-RIG',
        departmentCode: 'DRILL',
      }),
    ]);
  });

  it('does not pass the Master rowVersion bind to the JSA Version header update', async () => {
    const execute = jest.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
      if (sql.includes('UPDATE JSA_VERSION SET')) {
        const placeholders = new Set(
          Array.from(sql.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g), (match) => match[1]),
        );
        expect(new Set(Object.keys(binds))).toEqual(placeholders);
        expect(binds).not.toHaveProperty('rowVersion');
      }
      return { rowsAffected: 1 };
    });
    const repository = new OracleJsaDraftRepository();

    await repository.updateHeader(
      { connection: { execute } as never },
      {
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
      },
      {
        rowVersion: '7',
        versionRowVersion: '8',
        jobTitle: 'Updated job',
      },
      'tester',
    );
  });

  it('resolves active English and creates a JSA Version without Job Type', async () => {
    let nextId = 100;
    const execute = jest.fn(async (sql: string, _binds: Record<string, unknown> = {}) => {
      void _binds;
      if (sql.includes('FROM SYS_RIG R'))
        return {
          rows: [{ RIG_ID: '2', DEPARTMENT_ID: '3', MATRIX_VERSION_ID: '900', MATRIX_COUNT: 1 }],
        };
      if (sql.includes('FROM JSA_RISK_MATRIX_VERSION'))
        return { rows: [{ DIMENSION_SIZE: 3, L_COUNT: 3, S_COUNT: 3, C_COUNT: 9 }] };
      if (sql.includes("UPPER(LANGUAGE_CODE)='EN'"))
        return { rows: [{ LANGUAGE_ID: '1000000', C: 1 }] };
      if (sql.includes('NEXTVAL')) return { rows: [{ ID: String(nextId++) }] };
      return { rows: [], rowsAffected: 1 };
    });
    const repository = new OracleJsaDraftRepository();
    const context = { connection: { execute } as never };
    const input = { ownerSiteId: '1', rigId: '2', departmentId: '3' };

    const references = await repository.validateCreate(context, input);
    expect(references).toEqual({ matrixVersionId: '900', languageId: '1000000' });

    await repository.create(
      context,
      input,
      references.matrixVersionId,
      references.languageId,
      { number: 'DEV-1', scopeKey: 'DEV' },
      '7',
      'tester',
    );

    const versionInsert = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO JSA_VERSION'),
    );
    expect(versionInsert?.[0]).not.toContain('JOB_TYPE_ID');
    expect(versionInsert?.[1]).toMatchObject({ languageId: '1000000' });
    expect(versionInsert?.[1]).not.toHaveProperty('jobTypeId');
  });

  it('passes only SQL-recognized binds when inserting a complete new draft aggregate', async () => {
    let nextId = 100;
    const execute = jest.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
      expect(sql).not.toMatch(/:number\b/i);
      if (sql.includes('NEXTVAL')) return { rows: [{ ID: String(nextId++) }] };
      if (sql.includes('SELECT TO_CHAR(MATRIX_VERSION_ID)'))
        return { rows: [{ MATRIX_VERSION_ID: '900' }] };
      if (sql.includes('SELECT PROMPT_CODE')) return { rows: [{ CODE: 'PROMPT', NAME: 'Prompt' }] };
      if (sql.includes('SELECT POSITION_CODE'))
        return { rows: [{ CODE: 'POSITION', NAME: 'Position' }] };
      if (sql.includes('SELECT TOOL_CODE')) return { rows: [{ CODE: 'TOOL', NAME: 'Tool' }] };
      if (sql.includes('FROM JSA_ATTACHMENT_ASSET_VERSION V'))
        return {
          rows: [
            {
              FILE_NAME: 'permit.pdf',
              CONTENT_TYPE: 'application/pdf',
              FILE_SIZE: '1024',
              STORAGE_KEY: '3/4/5/file.pdf',
              CONTENT_SHA256: 'a'.repeat(64),
              DESCRIPTION: 'Permit',
            },
          ],
        };

      if (sql.trimStart().startsWith('INSERT INTO')) {
        const placeholders = new Set(
          Array.from(sql.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g), (match) => match[1]),
        );
        expect(new Set(Object.keys(binds))).toEqual(placeholders);
      }
      return { rows: [], rowsAffected: 1 };
    });
    const repository = new OracleJsaDraftRepository();

    await repository.saveContent(
      { connection: { execute } as never },
      {
        jsaId: '1',
        versionId: '2',
        siteId: '3',
        rigId: '4',
        departmentId: '5',
        creatorUserId: '6',
        status: 'DRAFT',
        versionStatus: 'DRAFT',
        rowVersion: '1',
        versionRowVersion: '1',
      },
      {
        versionRowVersion: '1',
        prompts: [
          {
            ref: 'prompt',
            promptId: '10',
            selected: true,
          },
        ],
        tasks: [
          {
            ref: 'task',
            number: '1',
            title: 'Task',
            displayOrder: 1,
            hazards: [
              {
                ref: 'hazard',
                text: 'Hazard',
                displayOrder: 1,
                initialRisk: {},
                residualRisk: {},
                controls: [{ ref: 'control', text: 'Control', displayOrder: 1 }],
              },
            ],
          },
        ],
        coverage: [
          {
            ref: 'coverage',
            promptRef: 'prompt',
            hazardRef: 'hazard',
            controlRef: 'control',
          },
        ],
        basicSteps: [
          {
            ref: 'step',
            taskRef: 'task',
            number: '1',
            text: 'Step',
            displayOrder: 1,
            noToolRequired: false,
            performers: [{ ref: 'performer', positionId: '20', displayOrder: 1 }],
            supervisors: [{ ref: 'supervisor', positionId: '21', displayOrder: 1 }],
            tools: [{ ref: 'tool', toolId: '30', displayOrder: 1 }],
          },
        ],
        procedureReferences: [
          {
            ref: 'procedure',
            code: 'PROC',
            title: 'Procedure',
            displayOrder: 1,
          },
        ],
        attachments: [{ ref: 'attachment', libraryAssetVersionId: '700' }],
      },
      'tester',
    );
  });
});
