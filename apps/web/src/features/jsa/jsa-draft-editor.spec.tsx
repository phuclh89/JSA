import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsaDraftDetail, RiskMatrixVersionDetail } from '@jsams/shared-types';
import { JsaDraftEditor } from './jsa-draft-editor';
import { jsaApi } from './jsa-api';

vi.mock('./jsa-api', () => ({
  jsaApi: {
    detail: vi.fn(),
    options: vi.fn(),
    header: vi.fn(),
    content: vi.fn(),
    validate: vi.fn(),
    cancel: vi.fn(),
  },
}));

function matrix(): RiskMatrixVersionDetail {
  const likelihoods = ['1', '2', '3'].map((code, index) => ({
    id: `L${code}`,
    code,
    label: `Probability ${code}`,
    numericValue: index + 1,
    displayOrder: index + 1,
    definition: `Probability definition ${code}`,
    active: true,
    rowVersion: '1',
  }));
  const severities = ['A', 'B', 'C'].map((code, index) => ({
    id: `S${code}`,
    code,
    label: `Severity ${code}`,
    numericValue: index + 1,
    displayOrder: index + 1,
    definition: `Severity definition ${code}`,
    active: true,
    rowVersion: '1',
  }));
  const results = [
    {
      id: 'LOW',
      code: 'LOW',
      name: 'Low',
      displayOrder: 1,
      displayColor: '#9fe870',
      prohibited: false,
      active: true,
      rowVersion: '1',
    },
  ];
  return {
    id: '900',
    matrixId: '90',
    matrixCode: 'TEST-3X3',
    matrixName: 'Test Matrix',
    dimension: 3,
    versionCode: 'V1',
    active: true,
    immutable: true,
    rowVersion: '1',
    likelihoods,
    severities,
    results,
    cells: likelihoods.flatMap((likelihood) =>
      severities.map((severity) => ({
        id: `${likelihood.id}-${severity.id}`,
        likelihoodId: likelihood.id,
        severityId: severity.id,
        ratingCode: 'L',
        ratingValue: 1,
        riskResultId: 'LOW',
        riskResultCode: 'LOW',
        riskResultName: 'Low',
        displayColor: '#9fe870',
        active: true,
        rowVersion: '1',
      })),
    ),
    completeness: {
      complete: true,
      expectedCellCount: 9,
      actualCellCount: 9,
      missingCells: [],
      errors: [],
    },
  };
}

function draft(): JsaDraftDetail {
  return {
    jsaId: '100',
    versionId: '200',
    jsaNumber: 'JSA-100',
    lifecycleStatus: 'DRAFT',
    versionStatus: 'DRAFT',
    ownerSiteId: '1',
    rigId: '2',
    departmentId: '3',
    jobTypeId: '4',
    matrixVersionId: '900',
    jobTitle: 'Single-page test',
    ptwRequired: false,
    creatorUserId: '10',
    rowVersion: '1',
    versionRowVersion: '1',
    prompts: [],
    tasks: [],
    basicSteps: [],
    promptCoverage: [],
    procedureReferences: [],
    attachments: [],
    matrix: matrix(),
    editable: true,
  };
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/jsa/100/draft']}>
        <Routes>
          <Route path="/jsa/:id/draft" element={<JsaDraftEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('JsaDraftEditor single-page worksheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jsaApi.detail).mockResolvedValue(draft());
    vi.mocked(jsaApi.options).mockResolvedValue([]);
  });

  it('renders all creation sections together without a tab workflow', async () => {
    renderEditor();
    expect(await screen.findByText('JSA GENERAL INFORMATION')).toBeInTheDocument();
    expect(screen.getByText(/USE THE HAZARD ASSESSMENT PROMPT/)).toBeInTheDocument();
    expect(screen.getByText(/RISK MATRIX · Test Matrix/)).toBeInTheDocument();
    expect(screen.getByText(/TASK \/ HAZARD \/ CONTROL ASSESSMENT/)).toBeInTheDocument();
    expect(screen.getByText(/BASIC JOB STEP/)).toBeInTheDocument();
    expect(screen.getByText('REFERENCES & ATTACHMENTS')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('opens familiar reference popups from the worksheet', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole('button', { name: /P — Probability/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('P — PROBABILITY');
    expect(screen.getByText('Probability definition 1')).toBeInTheDocument();
  });
});
