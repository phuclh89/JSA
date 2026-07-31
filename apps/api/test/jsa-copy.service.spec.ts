import { ResourceNotFoundError } from '../src/common/errors/application-errors';
import { JsaCopyService } from '../src/modules/jsa-copy/application/jsa-copy.service';

const actor = {
  userId: '1',
  username: 'tester',
  displayName: 'Test User',
  permissions: [],
  dataScopes: [],
} as any;
const input = {
  destinationSiteId: '10',
  destinationRigId: '20',
  destinationDepartmentId: '30',
};

describe('JsaCopyService audit boundaries', () => {
  it('records a required audit event when an independent capability is denied', async () => {
    const audit = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const service = new JsaCopyService(
      {} as any,
      {} as any,
      {
        require: jest.fn(() => {
          throw new Error('denied');
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      audit as any,
    );

    await expect(service.preflight('99', input, actor)).rejects.toThrow('denied');
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCode: 'JSA_COPY_AUTHORIZATION_DENIED',
        targetId: '99',
      }),
    );
  });

  it('does not disclose source scope denial and records the ambiguous not-found audit', async () => {
    const audit = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const service = new JsaCopyService(
      {
        withTransaction: jest.fn().mockRejectedValue(new ResourceNotFoundError('not found')),
      } as any,
      {} as any,
      { require: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      audit as any,
    );

    await expect(service.preflight('99', input, actor)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    expect(audit.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCode: 'JSA_COPY_SOURCE_DENIED_OR_NOT_FOUND',
        targetId: '99',
      }),
    );
  });
});

describe('JsaCopyService provenance', () => {
  it('returns an empty result for an ordinary JSA that was not created by Copy', async () => {
    const repository = {
      source: jest.fn().mockResolvedValue({
        jsaId: '99',
        siteId: '10',
        rigId: '20',
        departmentId: '30',
      }),
      provenance: jest.fn().mockResolvedValue(undefined),
    };
    const service = new JsaCopyService(
      { withTransaction: jest.fn((callback) => callback({})) } as any,
      repository as any,
      { requireView: jest.fn() } as any,
      { allows: jest.fn().mockReturnValue(true) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.provenance('99', actor)).resolves.toBeNull();
  });
});

describe('JsaCopyService Matrix policy', () => {
  const matrix = (id: string, dimension = 3) => ({
    id,
    code: `M-${id}`,
    name: `Matrix ${id}`,
    versionCode: 'V1',
    dimension,
  });
  const source = {
    jsaId: '99',
    versionId: '100',
    currentVersionId: '100',
    currentVersionPointer: '100',
    jsaNumber: 'PVD-I-DR-0001',
    jobTitle: 'Lift pump',
    versionNumber: 1,
    lifecycleStatus: 'PUBLISHED',
    versionStatus: 'PUBLISHED',
    siteId: '10',
    siteCode: 'OFFSHORE',
    siteName: 'Offshore',
    rigId: '11',
    rigCode: 'PVD-I',
    rigName: 'PV DRILLING I',
    departmentId: '12',
    departmentCode: 'DR',
    departmentName: 'Drilling',
    matrix: matrix('1'),
  };
  const aggregate = {
    prompts: [],
    tasks: [{ id: 't', title: 'Task', displayOrder: 1 }],
    hazards: [{ id: 'h', taskId: 't', text: 'Hazard', displayOrder: 1 }],
    controls: [{ id: 'c', hazardId: 'h', text: 'Control', displayOrder: 1 }],
    steps: [],
    performers: [],
    supervisors: [],
    tools: [],
    attachmentNames: [],
    promptCoverageCount: 0,
    procedureReferenceCount: 0,
    legacyHeaderPresent: false,
    invalidRiskReferenceCount: 0,
  };

  it.each([
    [3, 3, '1', 'PRESERVED', false],
    [3, 5, '2', 'CLEARED', true],
    [5, 3, '2', 'CLEARED', true],
  ] as const)(
    'uses exact Matrix-Version equality for %ix%i risk behavior',
    async (
      sourceDimension,
      destinationDimension,
      destinationMatrixId,
      riskCopyMode,
      reassessmentRequired,
    ) => {
      const audit = { recordRequired: jest.fn().mockResolvedValue(undefined) };
      const repository = {
        source: jest.fn().mockResolvedValue({ ...source, matrix: matrix('1', sourceDimension) }),
        aggregate: jest.fn().mockResolvedValue(aggregate),
        destinationResolution: jest.fn().mockResolvedValue({
          destination: {
            siteId: '10',
            siteCode: 'OFFSHORE',
            siteName: 'Offshore',
            rigId: '20',
            rigCode: 'PVD-II',
            rigName: 'PV DRILLING II',
            departmentId: '30',
            departmentCode: 'DR',
            departmentName: 'Drilling',
          },
          matrix: matrix(destinationMatrixId, destinationDimension),
          matrixComplete: true,
          englishCount: 1,
          languageId: '40',
          promptCandidates: [],
          positionCandidates: [],
          toolCandidates: [],
        }),
      };
      const service = new JsaCopyService(
        { withTransaction: jest.fn((callback) => callback({})) } as any,
        repository as any,
        { require: jest.fn() } as any,
        { allows: jest.fn().mockReturnValue(true) } as any,
        {} as any,
        { get: jest.fn((key: string) => (key === 'app.siteId' ? '10' : undefined)) } as any,
        audit as any,
      );

      const result = await service.preflight('99', input, actor);

      expect(result).toMatchObject({
        canCopy: true,
        riskCopyMode,
        matrixReassessmentRequired: reassessmentRequired,
      });
      expect(
        result.warnings.some((warning) => warning.code === 'MATRIX_DIFFERS_RISK_CLEARED'),
      ).toBe(reassessmentRequired);
    },
  );
});
