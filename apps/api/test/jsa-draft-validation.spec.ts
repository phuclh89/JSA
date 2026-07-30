import { JsaDraftValidationService } from '../src/modules/jsa-draft/application/jsa-draft-validation.service';
import type { JsaDraftDetail } from '@jsams/shared-types';
const service = new JsaDraftValidationService();
const draft = (): JsaDraftDetail => ({
  jsaId: '1',
  versionId: '2',
  jsaNumber: 'T-1',
  lifecycleStatus: 'DRAFT',
  versionStatus: 'DRAFT',
  ownerSiteId: '1',
  ownerSiteCode: 'DEV',
  ownerSiteName: 'JSAMS Local Development',
  rigId: '2',
  rigCode: 'DEV-RIG',
  rigName: 'Development Rig',
  departmentId: '3',
  departmentCode: 'DRILL',
  departmentName: 'Drilling',
  jobTypeId: '4',
  matrixVersionId: '5',
  languageId: '1000000',
  creatorUserId: '6',
  rowVersion: '1',
  versionRowVersion: '1',
  ptwRequired: false,
  prompts: [],
  tasks: [],
  basicSteps: [],
  promptCoverage: [],
  procedureReferences: [],
  attachments: [],
  editable: true,
  matrix: {
    id: '5',
    matrixId: '1',
    matrixCode: 'M',
    matrixName: 'Mixed',
    dimension: 5,
    versionCode: 'V1',
    active: true,
    immutable: true,
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
  },
});
describe('JSA Draft validation', () => {
  it('does not require a Procedure Reference for authoring or submission', () => {
    const result = service.validate(draft());
    expect(result.warnings.map((issue) => issue.code)).not.toContain('NO_PROCEDURE_REFERENCE');
  });

  it('groups incomplete draft errors by business section', () => {
    const result = service.validate(draft());
    expect(result.valid).toBe(false);
    expect(new Set(result.errors.map((x) => x.section))).toEqual(
      new Set(['GENERAL', 'RISK', 'BASIC_STEPS']),
    );
  });
  it('does not require a Job Type for a source JSA', () => {
    const value = draft();
    delete value.jobTypeId;

    expect(service.validate(value).errors.map((error) => error.code)).not.toContain(
      'JOB_TYPE_REQUIRED',
    );
  });
  it('blocks prohibited residual risk and uncovered selected prompts', () => {
    const value = draft();
    value.jobTitle = 'Job';
    value.tasks = [
      {
        id: '10',
        logicalKey: '10',
        title: 'Task',
        displayOrder: 1,
        rowVersion: '1',
        hazards: [
          {
            id: '11',
            logicalKey: '11',
            text: 'Hazard',
            displayOrder: 1,
            rowVersion: '1',
            controls: [
              { id: '12', logicalKey: '12', text: 'Control', displayOrder: 1, rowVersion: '1' },
            ],
            initialRisk: { cellId: '1' },
            residualRisk: { cellId: '2', prohibited: true },
          },
        ],
      },
    ];
    value.prompts = [
      {
        id: '20',
        logicalKey: '20',
        promptId: '1',
        code: 'P',
        label: 'Prompt',
        selected: true,
        rowVersion: '1',
      },
    ];
    value.basicSteps = [
      {
        id: '30',
        logicalKey: '30',
        text: 'Step',
        displayOrder: 1,
        noToolRequired: true,
        performers: [
          {
            id: '31',
            logicalKey: '31',
            positionId: '1',
            code: 'P',
            name: 'Performer',
            displayOrder: 1,
            rowVersion: '1',
          },
        ],
        supervisors: [
          {
            id: '32',
            logicalKey: '32',
            positionId: '2',
            code: 'S',
            name: 'Supervisor',
            displayOrder: 1,
            rowVersion: '1',
          },
        ],
        tools: [],
        rowVersion: '1',
      },
    ];
    const result = service.validate(value);
    expect(result.errors.map((x) => x.code)).toContain('RESIDUAL_RISK_PROHIBITED');
    expect(result.errors.map((x) => x.code)).not.toContain('PROMPT_COVERAGE_REQUIRED');
  });
  it('rejects task cycles and no-tool conflicts during structural save', () => {
    expect(() =>
      service.structural({
        versionRowVersion: '1',
        prompts: [],
        coverage: [],
        procedureReferences: [],
        attachments: [],
        tasks: [
          { ref: 'a', parentRef: 'b', title: 'A', displayOrder: 1, hazards: [] },
          { ref: 'b', parentRef: 'a', title: 'B', displayOrder: 2, hazards: [] },
        ],
        basicSteps: [],
      }),
    ).toThrow('cycle');
    expect(() =>
      service.structural({
        versionRowVersion: '1',
        prompts: [],
        coverage: [],
        procedureReferences: [],
        attachments: [],
        tasks: [],
        basicSteps: [
          {
            ref: 's',
            text: 'S',
            displayOrder: 1,
            noToolRequired: true,
            performers: [],
            supervisors: [],
            tools: [{ ref: 't', toolId: '1', displayOrder: 1 }],
          },
        ],
      }),
    ).toThrow('No tool required');
  });
  it('allows the same Oracle ID ref in different aggregate item types', () => {
    expect(() =>
      service.structural({
        versionRowVersion: '1',
        prompts: [
          {
            ref: '1000000',
            id: '1000000',
            rowVersion: '1',
            promptId: '1',
            selected: true,
          },
        ],
        tasks: [
          {
            ref: '1000000',
            id: '1000000',
            rowVersion: '1',
            title: 'Task',
            displayOrder: 1,
            hazards: [
              {
                ref: '1000000',
                id: '1000000',
                rowVersion: '1',
                text: 'Hazard',
                displayOrder: 1,
                initialRisk: { severityId: '1' },
                residualRisk: { severityId: '1' },
                controls: [
                  {
                    ref: '1000000',
                    id: '1000000',
                    rowVersion: '1',
                    text: 'Control',
                    displayOrder: 1,
                  },
                ],
              },
            ],
          },
        ],
        coverage: [
          {
            ref: '1000000',
            id: '1000000',
            rowVersion: '1',
            promptRef: '1000000',
            hazardRef: '1000000',
            controlRef: '1000000',
          },
        ],
        basicSteps: [
          {
            ref: '1000000',
            id: '1000000',
            rowVersion: '1',
            taskRef: '1000000',
            text: 'Step',
            displayOrder: 1,
            noToolRequired: false,
            performers: [
              {
                ref: '1000000',
                id: '1000000',
                rowVersion: '1',
                positionId: '1',
                displayOrder: 1,
              },
            ],
            supervisors: [
              {
                ref: '1000000',
                id: '1000000',
                rowVersion: '1',
                positionId: '2',
                displayOrder: 1,
              },
            ],
            tools: [
              {
                ref: '1000000',
                id: '1000000',
                rowVersion: '1',
                toolId: '3',
                displayOrder: 1,
              },
            ],
          },
        ],
        procedureReferences: [
          {
            ref: '1000000',
            id: '1000000',
            rowVersion: '1',
            code: 'PROC',
            displayOrder: 1,
          },
        ],
        attachments: [
          {
            ref: '1000000',
            id: '1000000',
            rowVersion: '1',
            libraryAssetVersionId: '4',
          },
        ],
      }),
    ).not.toThrow();
  });
  it('still rejects duplicate refs within the same aggregate item type', () => {
    expect(() =>
      service.structural({
        versionRowVersion: '1',
        prompts: [],
        tasks: [
          { ref: 'duplicate', title: 'A', displayOrder: 1, hazards: [] },
          { ref: 'duplicate', title: 'B', displayOrder: 2, hazards: [] },
        ],
        coverage: [],
        basicSteps: [],
        procedureReferences: [],
        attachments: [],
      }),
    ).toThrow('unique within its type');
  });
  it.each([0, 2])('rejects a Hazard with %s Controls during structural save', (controlCount) => {
    expect(() =>
      service.structural({
        versionRowVersion: '1',
        prompts: [],
        coverage: [],
        procedureReferences: [],
        attachments: [],
        tasks: [
          {
            ref: 'task',
            title: 'Task',
            displayOrder: 1,
            hazards: [
              {
                ref: 'hazard',
                text: 'Hazard',
                displayOrder: 1,
                initialRisk: {},
                residualRisk: {},
                controls: Array.from({ length: controlCount }, (_, index) => ({
                  ref: `control-${index}`,
                  text: 'Control',
                  displayOrder: index + 1,
                })),
              },
            ],
          },
        ],
        basicSteps: [],
      }),
    ).toThrow('exactly one Control');
  });
  it('reports invalid Control cardinality during business validation', () => {
    const value = draft();
    value.jobTitle = 'Job';
    value.tasks = [
      {
        id: '10',
        logicalKey: '10',
        title: 'Task',
        displayOrder: 1,
        rowVersion: '1',
        hazards: [
          {
            id: '11',
            logicalKey: '11',
            text: 'Hazard',
            displayOrder: 1,
            rowVersion: '1',
            controls: [],
            initialRisk: { cellId: '1' },
            residualRisk: { cellId: '2' },
          },
        ],
      },
    ];
    const result = service.validate(value);
    expect(result.errors.map((x) => x.code)).toContain('CONTROL_CARDINALITY_INVALID');
  });
  it('rejects a Residual Severity that differs from Initial Severity', () => {
    expect(() =>
      service.structural({
        versionRowVersion: '1',
        prompts: [],
        coverage: [],
        procedureReferences: [],
        attachments: [],
        tasks: [
          {
            ref: 'task',
            title: 'Task',
            displayOrder: 1,
            hazards: [
              {
                ref: 'hazard',
                text: 'Hazard',
                displayOrder: 1,
                initialRisk: { severityId: '1' },
                residualRisk: { severityId: '2' },
                controls: [{ ref: 'control', text: 'Control', displayOrder: 1 }],
              },
            ],
          },
        ],
        basicSteps: [],
      }),
    ).toThrow('Residual Severity must match Initial Severity');

    const value = draft();
    value.tasks = [
      {
        id: '10',
        logicalKey: '10',
        title: 'Task',
        displayOrder: 1,
        rowVersion: '1',
        hazards: [
          {
            id: '11',
            logicalKey: '11',
            text: 'Hazard',
            displayOrder: 1,
            rowVersion: '1',
            controls: [
              {
                id: '12',
                logicalKey: '12',
                text: 'Control',
                displayOrder: 1,
                rowVersion: '1',
              },
            ],
            initialRisk: { cellId: '1', severityId: '1' },
            residualRisk: { cellId: '2', severityId: '2' },
          },
        ],
      },
    ];
    expect(service.validate(value).errors.map((x) => x.code)).toContain(
      'RESIDUAL_SEVERITY_MISMATCH',
    );
  });
});
