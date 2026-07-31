import type {
  JsaDraftDetail,
  RiskMatrixVersionDetail,
  TranslationSegment,
} from '@jsams/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TranslationWorksheet, visibleTranslationSegments } from './translation-worksheet';

function matrix(): RiskMatrixVersionDetail {
  const likelihood = {
    id: 'L1',
    code: '1',
    label: 'Low probability',
    numericValue: 1,
    displayOrder: 1,
    definition: 'Rare',
    active: true,
    rowVersion: '1',
  };
  const severity = {
    id: 'S1',
    code: 'A',
    label: 'Minor',
    numericValue: 1,
    displayOrder: 1,
    definition: 'Minor impact',
    active: true,
    rowVersion: '1',
  };
  return {
    id: '900',
    matrixId: '90',
    matrixCode: 'TEST',
    matrixName: 'Source Matrix',
    dimension: 3,
    versionCode: 'V1',
    active: true,
    immutable: true,
    rowVersion: '1',
    likelihoods: [likelihood],
    severities: [severity],
    results: [
      {
        id: 'R1',
        code: 'LOW',
        name: 'Low',
        semanticCategory: 'ACCEPTABLE',
        displayOrder: 1,
        displayColor: '#85c744',
        prohibited: false,
        active: true,
        rowVersion: '1',
      },
    ],
    cells: [
      {
        id: 'C1',
        likelihoodId: likelihood.id,
        severityId: severity.id,
        ratingCode: '1',
        ratingValue: 1,
        riskResultId: 'R1',
        riskResultCode: 'LOW',
        riskResultName: 'Low',
        displayColor: '#85c744',
        active: true,
        rowVersion: '1',
      },
    ],
    completeness: {
      complete: false,
      expectedCellCount: 9,
      actualCellCount: 0,
      missingCells: [],
      errors: [],
    },
  };
}

function source(): JsaDraftDetail {
  return {
    jsaId: '1000110',
    versionId: '1000115',
    versionNumber: 3,
    jsaNumber: 'PV DRILLING I-CAT-0001.1',
    lifecycleStatus: 'PUBLISHED',
    versionStatus: 'PUBLISHED',
    ownerSiteId: '1',
    ownerSiteCode: 'OFFSHORE',
    ownerSiteName: 'Offshore',
    rigId: '2',
    rigCode: 'PVD-I',
    rigName: 'PV DRILLING I',
    departmentId: '3',
    departmentCode: 'CAT',
    departmentName: 'Catering',
    matrixVersionId: '900',
    languageId: '10',
    languageCode: 'EN',
    jobTitle: 'English job',
    ptwRequired: false,
    creatorUserId: '10',
    currentVersionId: '1000115',
    rowVersion: '1',
    versionRowVersion: '1',
    prompts: [
      {
        id: '20',
        logicalKey: '20',
        promptId: '20',
        code: 'HAT',
        label: 'Hard hat',
        selected: true,
        rowVersion: '1',
      },
    ],
    tasks: [
      {
        id: '30',
        logicalKey: '30',
        number: '1',
        title: 'English task',
        displayOrder: 1,
        rowVersion: '1',
        hazards: [
          {
            id: '31',
            logicalKey: '31',
            text: 'English hazard',
            displayOrder: 1,
            initialRisk: { likelihoodId: 'L1', severityId: 'S1', ratingCode: '1' },
            residualRisk: { likelihoodId: 'L1', severityId: 'S1', ratingCode: '1' },
            controls: [
              {
                id: '32',
                logicalKey: '32',
                text: 'English control',
                displayOrder: 1,
                rowVersion: '1',
              },
            ],
            rowVersion: '1',
          },
        ],
      },
    ],
    basicSteps: [],
    promptCoverage: [],
    procedureReferences: [],
    attachments: [],
    matrix: matrix(),
    editable: false,
  };
}

function segment(
  id: string,
  entityType: string,
  logicalKey: string,
  fieldCode: string,
  sectionCode: string,
): TranslationSegment {
  return {
    id,
    entityType,
    sourceEntityId: logicalKey,
    sourceLogicalKey: logicalKey,
    fieldCode,
    sectionCode,
    displayOrder: Number(id),
    required: true,
    sourceText: `${entityType} source`,
    sourceTextHash: 'A'.repeat(64),
    rowVersion: '1',
  };
}

const segments = [
  segment('1', 'HEADER', '1000115', 'JOB_TITLE', 'GENERAL'),
  segment('2', 'PROMPT', '20', 'LABEL', 'PROMPTS'),
  segment('3', 'TASK', '30', 'TITLE', 'TASKS'),
  segment('4', 'HAZARD', '31', 'TEXT', 'HAZARDS'),
  segment('5', 'CONTROL', '32', 'TEXT', 'CONTROLS'),
  segment('6', 'LIKELIHOOD', 'L1', 'LABEL', 'MATRIX'),
  segment('7', 'PROMPT', '20', 'CODE', 'PROMPTS'),
  segment('8', 'PERFORMER', '40', 'NAME', 'POSITIONS'),
  segment('9', 'SUPERVISOR', '41', 'NAME', 'POSITIONS'),
  segment('10', 'TOOL', '42', 'NAME', 'TOOLS'),
  segment('11', 'BASIC_STEP', '50', 'TEXT', 'BASIC_STEPS'),
];

describe('TranslationWorksheet', () => {
  it('excludes Matrix and governed code segments from translation', () => {
    expect(visibleTranslationSegments(segments).map(({ id }) => id)).toEqual([
      '1',
      '3',
      '4',
      '5',
      '11',
    ]);
  });

  it('renders the full JSA context and edits Task, Hazard, and Control in one row dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TranslationWorksheet
        source={source()}
        segments={segments}
        values={{}}
        editable
        targetLanguageName="Vietnamese"
        onChange={onChange}
      />,
    );

    expect(screen.getByText('JSA GENERAL INFORMATION')).toBeInTheDocument();
    expect(screen.getByText('Hard hat')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Vietnamese translation for PROMPT LABEL' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/RISK MATRIX/)).toBeInTheDocument();
    expect(screen.getByText('No translation required')).toBeInTheDocument();
    expect(screen.getByText('English task')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Risk Matrix source reference' })).toBeInTheDocument();
    expect(screen.getByText('RISK COLOUR OVERVIEW')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Translate Task 1' }));
    expect(screen.getByText('Translate Task 1')).toBeInTheDocument();
    expect(screen.getAllByText('English hazard')).toHaveLength(2);
    const taskInput = screen.getByRole('textbox', {
      name: 'Vietnamese translation for TASK TITLE',
    });
    await user.type(taskInput, 'Công việc');
    expect(onChange).toHaveBeenCalledWith('3', 'C');
  });

  it('shows an inline translated row as soon as that row has translated content', () => {
    const { container } = render(
      <TranslationWorksheet
        source={source()}
        segments={segments}
        values={{ '3': 'Công việc', '4': 'Mối nguy', '5': 'Biện pháp kiểm soát' }}
        editable
        targetLanguageName="Vietnamese"
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.translation-inline-row')).toHaveLength(1);
    expect(screen.getByText('Công việc')).toBeInTheDocument();
    expect(screen.getByText('Mối nguy')).toBeInTheDocument();
    expect(screen.getByText('Biện pháp kiểm soát')).toBeInTheDocument();
  });

  it('shows the Basic Job Step translation inline without translating roles or tools', () => {
    const detail = source();
    detail.basicSteps = [
      {
        id: '50',
        logicalKey: '50',
        number: '1',
        text: 'English basic step',
        displayOrder: 1,
        noToolRequired: true,
        performers: [],
        supervisors: [],
        tools: [],
        rowVersion: '1',
      },
    ];
    const { container } = render(
      <TranslationWorksheet
        source={detail}
        segments={segments}
        values={{ '11': 'Bước công việc' }}
        editable
        targetLanguageName="Vietnamese"
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.translation-basic-step-inline-row')).toHaveLength(1);
    expect(screen.getByText('Bước công việc')).toBeInTheDocument();
  });
});
