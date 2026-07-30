import { OracleMasterDataRepository } from '../src/modules/master-data/infrastructure/oracle-master-data.repository';

describe('OracleMasterDataRepository organization administration', () => {
  it('lists Rig records with their governed Site context', async () => {
    const execute = jest.fn(async (sql: string) =>
      sql.includes('COUNT(*)')
        ? { rows: [{ TOTAL_COUNT: 1 }] }
        : {
            rows: [
              {
                ID_VALUE: '2',
                CODE_VALUE: 'PVV',
                NAME_VALUE: 'PV Drilling V',
                SITE_ID: '1',
                SITE_CODE: 'OFFSHORE',
                SITE_NAME: 'Offshore',
                IS_ACTIVE: 'Y',
                ROW_VERSION: '1',
              },
            ],
          },
    );
    const repository = new OracleMasterDataRepository();

    await expect(
      repository.listOrganizations({ connection: { execute } as never }, 'rigs', {
        page: 1,
        pageSize: 20,
        active: true,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: '2',
          kind: 'rigs',
          code: 'PVV',
          siteId: '1',
          siteCode: 'OFFSHORE',
          active: true,
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
});
