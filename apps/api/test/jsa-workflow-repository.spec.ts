import { OracleJsaWorkflowRepository } from '../src/modules/jsa-workflow/infrastructure/oracle-jsa-workflow.repository';

describe('OracleJsaWorkflowRepository official numbering', () => {
  it('assigns the next Rig-Department number atomically on final publication', async () => {
    let sequence = 100;
    const execute = jest.fn(async (sql: string, binds: Record<string, unknown> = {}) => {
      if (sql.includes('SELECT TO_CHAR(') && sql.includes('.NEXTVAL'))
        return { rows: [{ ID: String(sequence++) }] };
      if (sql.includes('SELECT JSA_NUMBER,NUMBER_STATUS'))
        return { rows: [{ JSA_NUMBER: 'TMP-10', NUMBER_STATUS: 'TEMPORARY' }] };
      if (sql.includes('SELECT R.RIG_CODE,D.DEPARTMENT_CODE'))
        return { rows: [{ RIG_CODE: 'PVV', DEPARTMENT_CODE: 'DRILL' }] };
      if (sql.includes('SELECT LAST_NUMBER')) return { rows: [{ LAST_NUMBER: 41 }] };
      if (sql.includes("NUMBER_STATUS='OFFICIAL'")) {
        expect(binds).toMatchObject({
          officialNumber: 'PVV-DRILL-0042',
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
      expect.objectContaining({ officialNumber: 'PVV-DRILL-0042' }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO SYS_NOTIFICATION'),
      expect.objectContaining({ subject: 'JSA published: PVV-DRILL-0042' }),
    );
  });
});
