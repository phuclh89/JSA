import type {
  AuthenticatedUser,
  RigMatrixAssignment,
  RiskMatrixSummary,
  RiskMatrixVersionDetail,
} from '@jsams/shared-types';
import { RiskMatrixService } from '../src/modules/risk-matrix/application/risk-matrix.service';
import type { RiskMatrixRepository } from '../src/modules/risk-matrix/domain/risk-matrix.repository';

const user: AuthenticatedUser = {
  userId: '1',
  enterpriseIdentityKey: 'test-user',
  username: 'test-user',
  displayName: 'Test User',
  roles: ['SYSTEM_ADMIN'],
  permissions: ['SYSTEM_ADMIN'],
  permissionOverrides: [],
  dataScopes: [],
  authentication: { mode: 'development' },
};

const matrix: RiskMatrixSummary = {
  id: '10',
  code: 'MIXED',
  name: 'Mixed codes',
  dimension: 5,
  active: true,
  rowVersion: '1',
  versionCount: 1,
};

const version: RiskMatrixVersionDetail = {
  id: '20',
  matrixId: matrix.id,
  matrixCode: matrix.code,
  matrixName: matrix.name,
  dimension: 5,
  versionCode: 'V1',
  active: true,
  immutable: false,
  rowVersion: '1',
  likelihoods: [],
  severities: [],
  results: [],
  cells: [],
  completeness: {
    complete: true,
    expectedCellCount: 25,
    actualCellCount: 25,
    missingCells: [],
    errors: [],
  },
};

const assignment = (id: string, siteId: string, rigId: string): RigMatrixAssignment => ({
  id,
  siteId,
  rigId,
  rigCode: `RIG-${rigId}`,
  matrixVersionId: version.id,
  matrixCode: matrix.code,
  versionCode: version.versionCode,
  dimension: version.dimension,
  effectiveFrom: '2030-01-01T00:00:00.000Z',
  reason: 'Approved configuration',
  active: true,
  rowVersion: '1',
});

describe('RiskMatrixService assignment controls', () => {
  const transaction = {};
  const oracle = {
    withTransaction: jest.fn(async (handler: (context: unknown) => unknown) =>
      handler(transaction),
    ),
  };
  const repository = {
    lockRig: jest.fn(),
    loadVersion: jest.fn(),
    findMatrix: jest.fn(),
    hasOverlap: jest.fn(),
    createAssignment: jest.fn(),
    listAssignments: jest.fn(),
  };
  const scopes = { allows: jest.fn() };
  const audit = { recordRequired: jest.fn() };
  const service = new RiskMatrixService(
    oracle as never,
    repository as unknown as RiskMatrixRepository,
    scopes as never,
    audit as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('filters assignment listings by independent VIEW data scope', async () => {
    repository.listAssignments.mockResolvedValue({
      items: [assignment('1', '100', '101'), assignment('2', '200', '201')],
      total: 2,
    });
    scopes.allows.mockImplementation(
      (_user: AuthenticatedUser, target: { siteId: string }) => target.siteId === '100',
    );

    await expect(service.listAssignments(user)).resolves.toMatchObject({
      total: 1,
      items: [{ id: '1' }],
    });
  });

  it('blocks assignment when the complete version belongs to an inactive Matrix', async () => {
    repository.lockRig.mockResolvedValue({ rigId: '101', siteId: '100', active: true });
    scopes.allows.mockReturnValue(true);
    repository.loadVersion.mockResolvedValue(version);
    repository.findMatrix.mockResolvedValue({ ...matrix, active: false });

    await expect(
      service.createAssignment(
        {
          rigId: '101',
          matrixVersionId: version.id,
          effectiveFrom: '2030-01-01T00:00:00.000Z',
          reason: 'Approved change',
        },
        user,
      ),
    ).rejects.toMatchObject({ code: 'MATRIX_VERSION_INCOMPLETE' });
    expect(repository.createAssignment).not.toHaveBeenCalled();
  });

  it('serializes the Rig, rejects overlap, and does not audit a failed write', async () => {
    repository.lockRig.mockResolvedValue({ rigId: '101', siteId: '100', active: true });
    scopes.allows.mockReturnValue(true);
    repository.loadVersion.mockResolvedValue(version);
    repository.findMatrix.mockResolvedValue(matrix);
    repository.hasOverlap.mockResolvedValue(assignment('99', '100', '101'));

    await expect(
      service.createAssignment(
        {
          rigId: '101',
          matrixVersionId: version.id,
          effectiveFrom: '2030-02-01T00:00:00.000Z',
          reason: 'Overlapping test',
        },
        user,
      ),
    ).rejects.toMatchObject({ code: 'RIG_MATRIX_ASSIGNMENT_OVERLAP' });
    expect(repository.lockRig.mock.invocationCallOrder[0]).toBeLessThan(
      repository.hasOverlap.mock.invocationCallOrder[0]!,
    );
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });

  it('creates and audits a valid authorized assignment', async () => {
    const created = assignment('50', '100', '101');
    repository.lockRig.mockResolvedValue({ rigId: '101', siteId: '100', active: true });
    scopes.allows.mockReturnValue(true);
    repository.loadVersion.mockResolvedValue(version);
    repository.findMatrix.mockResolvedValue(matrix);
    repository.hasOverlap.mockResolvedValue(undefined);
    repository.createAssignment.mockResolvedValue(created);

    await expect(
      service.createAssignment(
        {
          rigId: '101',
          matrixVersionId: version.id,
          effectiveFrom: created.effectiveFrom,
          reason: created.reason,
        },
        user,
      ),
    ).resolves.toEqual(created);
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCode: 'RIG_MATRIX_ASSIGNED',
        siteId: '100',
        rigId: '101',
        targetId: '50',
      }),
    );
  });
});
