import { OracleJsaWorkflowRepository } from '../src/modules/jsa-workflow/infrastructure/oracle-jsa-workflow.repository';

describe('OracleJsaWorkflowRepository official numbering', () => {
  it('assigns the next Rig-Department number atomically on final publication', async () => {
    let sequence = 100;
    const execute = jest.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
      if (sql.includes('SELECT TO_CHAR(') && sql.includes('.NEXTVAL'))
        return { rows: [{ ID: String(sequence++) }] };
      if (sql.includes('SELECT JSA_NUMBER,NUMBER_STATUS'))
        return { rows: [{ JSA_NUMBER: 'TMP-10', NUMBER_STATUS: 'TEMPORARY' }] };
      if (sql.includes('TO_CHAR(M.CURRENT_VERSION_ID) CURRENT_VERSION_ID'))
        return {
          rows: [
            {
              CURRENT_VERSION_ID: null,
              WORKING_VERSION_ID: '11',
              BASE_VERSION_ID: null,
              CURRENT_STATUS: null,
              NUMBER_STATUS: 'TEMPORARY',
              JSA_NUMBER: 'TMP-10',
            },
          ],
        };
      if (sql.includes('SELECT R.RIG_NAME,D.DEPARTMENT_CODE'))
        return { rows: [{ RIG_NAME: 'PV DRILLING V', DEPARTMENT_CODE: 'DR' }] };
      if (sql.includes('SELECT LAST_NUMBER')) return { rows: [{ LAST_NUMBER: 41 }] };
      if (sql.includes("NUMBER_STATUS='OFFICIAL'")) {
        expect(binds).toMatchObject({
          officialNumber: 'PV DRILLING V-DR-0042',
          siteId: '1',
          jsaId: '10',
        });
      }
      return { rowsAffected: 1, rows: [] };
    });
    const repository = new OracleJsaWorkflowRepository();

    await repository.action(
      { connection: { execute } as never },
      {
        instanceId: '40',
        cycleNumber: 1,
        definitionId: '20',
        bindingId: '30',
        status: 'ACTIVE',
        currentTaskId: '50',
        assigneeUserId: '9',
        stepId: '21',
        versionStatus: 'OIM_REVIEW',
        target: {
          jsaId: '10',
          versionId: '11',
          jsaNumber: 'TMP-10',
          siteId: '1',
          rigId: '2',
          departmentId: '3',
          creatorUserId: '8',
          masterStatus: 'DRAFT',
          versionStatus: 'OIM_REVIEW',
          masterRowVersion: '1',
          versionRowVersion: '1',
        },
      },
      'APPROVE',
      undefined,
      undefined,
      undefined,
      '9',
      'oim',
      'correlation',
    );

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE JSA_NUMBER_COUNTER'),
      expect.objectContaining({ nextNumber: 42 }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("NUMBER_STATUS='OFFICIAL'"),
      expect.objectContaining({ officialNumber: 'PV DRILLING V-DR-0042' }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining(
        'ROW_NUMBER() OVER (ORDER BY DISPLAY_ORDER,VERSION_TASK_ID) NEW_ORDER',
      ),
      expect.objectContaining({ versionId: '11', username: 'oim' }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO SYS_NOTIFICATION'),
      expect.objectContaining({ subject: 'JSA published: PV DRILLING V-DR-0042' }),
    );
  });

  it('increments the official JSA revision suffix only when an update is published', async () => {
    let publishedNumber = '';
    const execute = jest.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
      if (sql.includes('TO_CHAR(M.CURRENT_VERSION_ID) CURRENT_VERSION_ID'))
        return {
          rows: [
            {
              CURRENT_VERSION_ID: '10',
              WORKING_VERSION_ID: '11',
              BASE_VERSION_ID: '10',
              CURRENT_STATUS: 'PUBLISHED',
              NUMBER_STATUS: 'OFFICIAL',
              JSA_NUMBER: 'PV DRILLING I-CAT-0001.1',
            },
          ],
        };
      if (sql.includes('SELECT JSA_NUMBER,NUMBER_STATUS'))
        return {
          rows: [
            {
              JSA_NUMBER: 'PV DRILLING I-CAT-0001.1',
              NUMBER_STATUS: 'OFFICIAL',
            },
          ],
        };
      if (sql.includes('SET JSA_NUMBER=:officialNumber')) {
        publishedNumber = String(binds.officialNumber);
        expect(binds).toMatchObject({
          officialNumber: 'PV DRILLING I-CAT-0001.2',
          currentNumber: 'PV DRILLING I-CAT-0001.1',
          jsaId: '20',
        });
      }
      return { rowsAffected: 1, rows: [] };
    });
    const repository = new OracleJsaWorkflowRepository();

    await repository.action(
      { connection: { execute } as never },
      {
        instanceId: '40',
        cycleNumber: 1,
        definitionId: '20',
        bindingId: '30',
        status: 'ACTIVE',
        currentTaskId: '50',
        assigneeUserId: '9',
        stepId: '21',
        versionStatus: 'OIM_REVIEW',
        target: {
          jsaId: '20',
          versionId: '11',
          jsaNumber: 'PV DRILLING I-CAT-0001.1',
          siteId: '1',
          rigId: '2',
          departmentId: '3',
          creatorUserId: '8',
          masterStatus: 'PUBLISHED',
          versionStatus: 'OIM_REVIEW',
          masterRowVersion: '1',
          versionRowVersion: '1',
        },
      },
      'APPROVE',
      undefined,
      undefined,
      undefined,
      '9',
      'oim',
      'correlation',
    );

    expect(publishedNumber).toBe('PV DRILLING I-CAT-0001.2');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO SYS_NOTIFICATION'),
      expect.objectContaining({ subject: 'JSA published: PV DRILLING I-CAT-0001.2' }),
    );
  });
});
