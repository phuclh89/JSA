import type { OracleTransactionContext } from '../src/common/oracle/oracle.types';
import { OracleJsaVersioningRepository } from '../src/modules/jsa-versioning/infrastructure/oracle-jsa-versioning.repository';

describe('OracleJsaVersioningRepository', () => {
  it('binds jsaId only for the snapshot header query', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ID: '101',
            VERSION_LABEL: 'V1',
            OWNER_SITE_ID: '1',
            RIG_ID: '2',
            DEPARTMENT_ID: '3',
            MATRIX_VERSION_ID: '4',
            LANGUAGE_ID: '5',
            PTW_REQUIRED_FLAG: 'N',
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const context = {
      connection: { execute },
    } as unknown as OracleTransactionContext;

    await new OracleJsaVersioningRepository().snapshots(context, '10', '101');

    expect(execute.mock.calls[0]?.[1]).toEqual({ jsaId: '10', versionId: '101' });
    expect(execute.mock.calls.length).toBeGreaterThan(1);
    for (const call of execute.mock.calls.slice(1))
      expect(call[1]).toEqual({ versionId: '101' });
  });
});
