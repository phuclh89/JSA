import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsaDraftDetail, RiskMatrixVersionDetail } from '@jsams/shared-types';
import { JsaDraftEditor } from './jsa-draft-editor';
import { jsaApi } from './jsa-api';
import { versioningApi } from './versioning-api';
import { workflowApi } from './workflow-api';

vi.mock('./jsa-api', () => ({
  jsaApi: {
    detail: vi.fn(),
    options: vi.fn(),
    attachmentPicker: vi.fn(),
    save: vi.fn(),
    header: vi.fn(),
    content: vi.fn(),
    validate: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock('./workflow-api', () => ({
  workflowApi: {
    preview: vi.fn(),
    detail: vi.fn(),
    submit: vi.fn(),
  },
}));
vi.mock('./versioning-api', () => ({
  versioningApi: {
    capabilities: vi.fn(async () => ({
      configured: true,
      update: true,
      compare: true,
      undoCheckout: true,
    })),
    undo: vi.fn(),
    compare: vi.fn(),
    reviewCompare: vi.fn(),
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
    ownerSiteCode: 'DEV',
    ownerSiteName: 'JSAMS Local Development',
    rigId: '2',
    rigCode: 'DEV-RIG',
    rigName: 'Development Rig',
    departmentId: '3',
    departmentCode: 'DRILL',
    departmentName: 'Drilling',
    jobTypeId: '4',
    matrixVersionId: '900',
    languageId: '1000000',
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

function renderEditor(props?: {
  embedded?: boolean;
  forceReadOnly?: boolean;
  reviewComparison?: boolean;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/jsa/100/draft']}>
        <Routes>
          <Route path="/jsa/:id/draft" element={<JsaDraftEditor {...props} />} />
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
    vi.mocked(jsaApi.attachmentPicker).mockResolvedValue({ folders: [], assets: [] });
    vi.mocked(workflowApi.preview).mockResolvedValue({
      configured: true,
      steps: [
        {
          stepId: '1',
          stepOrder: 1,
          stepCode: 'DEPARTMENT_HEAD',
          stepName: 'Department Head',
          versionStatus: 'DEPARTMENT_HEAD_REVIEW',
          workflowRoleCode: 'DEPARTMENT_HEAD',
          assigneeUserId: '11',
          assigneeName: 'Department Head User',
        },
        {
          stepId: '2',
          stepOrder: 2,
          stepCode: 'STC',
          stepName: 'STC',
          versionStatus: 'STC_REVIEW',
          workflowRoleCode: 'STC',
          assigneeUserId: '12',
          assigneeName: 'STC User',
        },
        {
          stepId: '3',
          stepOrder: 3,
          stepCode: 'OIM',
          stepName: 'OIM',
          versionStatus: 'OIM_REVIEW',
          workflowRoleCode: 'OIM',
          assigneeUserId: '13',
          assigneeName: 'OIM User',
        },
      ],
      errors: [],
    });
    vi.mocked(workflowApi.detail).mockResolvedValue({
      instanceId: 'workflow-1',
      jsaId: '100',
      versionId: '200',
      jsaNumber: 'JSA-100',
      jobTitle: 'Single-page test',
      ownerSiteId: '1',
      rigId: '2',
      departmentId: '3',
      creatorUserId: '10',
      status: 'RETURNED',
      versionStatus: 'RETURNED',
      cycleNumber: 1,
      actions: [],
    });
  });

  it('highlights changed fields and fades entities deleted from the Published Version', async () => {
    const value = draft();
    value.baseVersionId = '199';
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    vi.mocked(versioningApi.compare).mockResolvedValue({
      jsaId: '100',
      baseVersionId: '199',
      workingVersionId: '200',
      summary: { ADDED: 0, MODIFIED: 1, DELETED: 1, MOVED: 0, UNCHANGED: 0 },
      changes: [
        {
          entityType: 'HEADER',
          logicalKey: 'HEADER',
          changeType: 'MODIFIED',
          label: 'General Information',
          fields: [{ field: 'jobTitle', oldValue: 'Old title', newValue: value.jobTitle }],
        },
        {
          entityType: 'TASK',
          logicalKey: 'old-task',
          changeType: 'DELETED',
          label: 'Removed task',
          fields: [],
          oldPosition: 'ROOT:1',
        },
      ],
    });

    renderEditor();

    const title = await screen.findByDisplayValue('Single-page test');
    await waitFor(() => expect(title.closest('label')).toHaveClass('worksheet-cell--changed'));
    expect(await screen.findByLabelText('Deleted row: Removed task')).toHaveClass(
      'worksheet-deleted-grid-row',
    );
  });

  it('uses workflow review comparison to highlight the embedded read-only worksheet', async () => {
    const value = draft();
    value.baseVersionId = '199';
    value.editable = false;
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'Updated task for approval',
        displayOrder: 1,
        hazards: [],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    vi.mocked(versioningApi.reviewCompare).mockResolvedValue({
      jsaId: '100',
      baseVersionId: '199',
      workingVersionId: '200',
      summary: { ADDED: 0, MODIFIED: 1, DELETED: 0, MOVED: 0, UNCHANGED: 0 },
      changes: [
        {
          entityType: 'TASK',
          logicalKey: 'task-1',
          changeType: 'MODIFIED',
          label: 'Updated task for approval',
          fields: [
            {
              field: 'title',
              oldValue: 'Published task',
              newValue: 'Updated task for approval',
            },
          ],
        },
      ],
    });

    renderEditor({ embedded: true, forceReadOnly: true, reviewComparison: true });

    const task = await screen.findByDisplayValue('Updated task for approval');
    expect(task.closest('td')).toHaveClass('worksheet-cell--changed');
    expect(versioningApi.reviewCompare).toHaveBeenCalledWith('100');
    expect(versioningApi.compare).not.toHaveBeenCalled();
  });

  it('highlights newly added Task and Basic Job Step rows immediately before Save Draft', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('TASK / HAZARD / CONTROL ASSESSMENT (0)');
    await user.click(screen.getByRole('button', { name: /Add Task$/ }));
    await user.type(screen.getByLabelText('Task 1'), 'New task');

    const taskRow = screen.getByLabelText('Added row: New task');
    expect(taskRow).toHaveClass('worksheet-added-grid-row');
    expect(taskRow.children).toHaveLength(11);

    await user.click(screen.getByRole('button', { name: /Add Basic Job Step$/ }));
    await user.type(screen.getByLabelText('Basic Job Step 1'), 'New basic step');

    expect(screen.getByLabelText('Added row: New basic step')).toHaveClass(
      'worksheet-added-grid-row',
    );
  });

  it('keeps saved ADDED rows green without marking their individual cells as modified', async () => {
    const value = draft();
    value.baseVersionId = '199';
    value.tasks = [
      {
        id: '300',
        logicalKey: 'added-task',
        number: '1',
        title: 'Saved new task',
        displayOrder: 1,
        hazards: [
          {
            id: '301',
            logicalKey: 'added-hazard',
            text: 'Saved new hazard',
            displayOrder: 1,
            initialRisk: {},
            residualRisk: {},
            controls: [
              {
                id: '302',
                logicalKey: 'added-control',
                text: 'Saved new control',
                displayOrder: 1,
                rowVersion: '1',
              },
            ],
            rowVersion: '1',
          },
        ],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    vi.mocked(versioningApi.compare).mockResolvedValue({
      jsaId: '100',
      baseVersionId: '199',
      workingVersionId: '200',
      summary: { ADDED: 3, MODIFIED: 0, DELETED: 0, MOVED: 0, UNCHANGED: 0 },
      changes: [
        {
          entityType: 'TASK',
          logicalKey: 'added-task',
          changeType: 'ADDED',
          label: 'Saved new task',
          fields: [{ field: 'title', newValue: 'Saved new task' }],
        },
        {
          entityType: 'HAZARD',
          logicalKey: 'added-hazard',
          changeType: 'ADDED',
          label: 'Saved new hazard',
          fields: [{ field: 'text', newValue: 'Saved new hazard' }],
        },
        {
          entityType: 'CONTROL',
          logicalKey: 'added-control',
          changeType: 'ADDED',
          label: 'Saved new control',
          fields: [{ field: 'text', newValue: 'Saved new control' }],
        },
      ],
    });

    renderEditor();

    const addedRow = await screen.findByLabelText('Added row: Saved new task');
    expect(addedRow).toHaveClass('worksheet-added-grid-row');
    expect(addedRow.querySelectorAll('.worksheet-cell--changed')).toHaveLength(0);
  });

  it('shows added and deleted Performer, Supervisor, and Tool selections in their cells', async () => {
    const value = draft();
    value.baseVersionId = '199';
    value.basicSteps = [
      {
        id: '400',
        logicalKey: 'step-1',
        number: '1',
        text: 'Existing basic step',
        displayOrder: 1,
        noToolRequired: true,
        performers: [
          {
            id: '402',
            logicalKey: 'performer-added',
            positionId: '22',
            code: 'FLOORHAND',
            name: 'Floorhand',
            displayOrder: 1,
            rowVersion: '1',
          },
        ],
        supervisors: [
          {
            id: '403',
            logicalKey: 'supervisor-added',
            positionId: '23',
            code: 'DRILLER',
            name: 'Driller',
            displayOrder: 1,
            rowVersion: '1',
          },
        ],
        tools: [],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    vi.mocked(versioningApi.compare).mockResolvedValue({
      jsaId: '100',
      baseVersionId: '199',
      workingVersionId: '200',
      summary: { ADDED: 2, MODIFIED: 0, DELETED: 3, MOVED: 0, UNCHANGED: 1 },
      changes: [
        {
          entityType: 'BASIC_STEP',
          logicalKey: 'step-1',
          changeType: 'UNCHANGED',
          label: 'Existing basic step',
          fields: [],
        },
        {
          entityType: 'PERFORMER',
          logicalKey: 'performer-added',
          changeType: 'ADDED',
          label: 'Floorhand',
          fields: [],
          newPosition: 'step-1:1',
        },
        {
          entityType: 'PERFORMER',
          logicalKey: 'performer-deleted',
          changeType: 'DELETED',
          label: 'Pumpman',
          fields: [],
          oldPosition: 'step-1:1',
        },
        {
          entityType: 'SUPERVISOR',
          logicalKey: 'supervisor-added',
          changeType: 'ADDED',
          label: 'Driller',
          fields: [],
          newPosition: 'step-1:1',
        },
        {
          entityType: 'SUPERVISOR',
          logicalKey: 'supervisor-deleted',
          changeType: 'DELETED',
          label: 'Toolpusher',
          fields: [],
          oldPosition: 'step-1:1',
        },
        {
          entityType: 'TOOL',
          logicalKey: 'tool-deleted',
          changeType: 'DELETED',
          label: 'Hand tool',
          fields: [],
          oldPosition: 'step-1:1',
        },
      ],
    });

    renderEditor();

    const performerCell = (await screen.findByRole('button', {
      name: /Select performers \(1\)/,
    })).closest('td');
    const supervisorCell = screen
      .getByRole('button', { name: /Select supervisors \(1\)/ })
      .closest('td');
    const toolCell = screen.getByRole('button', { name: /Select tools \(0\)/ }).closest('td');

    expect(performerCell).toHaveClass('worksheet-cell--changed');
    expect(supervisorCell).toHaveClass('worksheet-cell--changed');
    expect(toolCell).toHaveClass('worksheet-cell--changed');
    expect(screen.getByText('Floorhand').closest('.ant-tag')).toHaveClass(
      'assignment-value--added',
    );
    expect(screen.getByText('Driller').closest('.ant-tag')).toHaveClass('assignment-value--added');
    expect(screen.getByText('Pumpman').closest('.ant-tag')).toHaveClass(
      'assignment-value--deleted',
    );
    expect(screen.getByText('Toolpusher').closest('.ant-tag')).toHaveClass(
      'assignment-value--deleted',
    );
    expect(screen.getByText('Hand tool').closest('.ant-tag')).toHaveClass(
      'assignment-value--deleted',
    );
  });

  it('keeps a persisted Task visible as a faded tombstone immediately after Delete', async () => {
    const user = userEvent.setup();
    const value = draft();
    value.baseVersionId = '199';
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'Task retained after delete',
        displayOrder: 1,
        hazards: [
          {
            id: '301',
            logicalKey: 'hazard-1',
            text: 'Existing hazard',
            displayOrder: 1,
            initialRisk: {},
            residualRisk: {},
            controls: [],
            rowVersion: '1',
          },
        ],
        rowVersion: '1',
      },
      {
        id: '310',
        logicalKey: 'task-2',
        number: '2',
        title: 'Task after deleted row',
        displayOrder: 2,
        hazards: [
          {
            id: '311',
            logicalKey: 'hazard-2',
            text: 'Following hazard',
            displayOrder: 1,
            initialRisk: {},
            residualRisk: {},
            controls: [],
            rowVersion: '1',
          },
        ],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    vi.mocked(versioningApi.compare).mockResolvedValue({
      jsaId: '100',
      baseVersionId: '199',
      workingVersionId: '200',
      summary: { ADDED: 0, MODIFIED: 0, DELETED: 0, MOVED: 0, UNCHANGED: 4 },
      changes: [
        {
          entityType: 'TASK',
          logicalKey: 'task-1',
          changeType: 'UNCHANGED',
          label: 'Task retained after delete',
          fields: [],
        },
        {
          entityType: 'HAZARD',
          logicalKey: 'hazard-1',
          changeType: 'UNCHANGED',
          label: 'Existing hazard',
          fields: [],
        },
        {
          entityType: 'TASK',
          logicalKey: 'task-2',
          changeType: 'UNCHANGED',
          label: 'Task after deleted row',
          fields: [],
        },
        {
          entityType: 'HAZARD',
          logicalKey: 'hazard-2',
          changeType: 'UNCHANGED',
          label: 'Following hazard',
          fields: [],
        },
      ],
    });

    renderEditor();
    expect(screen.queryByText('Added since the Published Version')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Expand' }));
    await screen.findByText('Added since the Published Version');
    expect(screen.getByText('Changed since the Published Version')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Delete Task' })[0]!);

    expect(screen.queryByDisplayValue('Task retained after delete')).not.toBeInTheDocument();
    const deletedRow = screen.getByLabelText('Deleted row: Task retained after delete');
    expect(deletedRow).toHaveClass('worksheet-deleted-grid-row');
    expect(deletedRow).toHaveTextContent('Existing hazard');
    expect(deletedRow.children).toHaveLength(11);
    const followingRow = screen.getByDisplayValue('Task after deleted row').closest('tr');
    expect(followingRow).not.toBeNull();
    expect(
      deletedRow.compareDocumentPosition(followingRow!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders all creation sections together without a tab workflow', async () => {
    renderEditor();
    expect(await screen.findByText('JSA GENERAL INFORMATION')).toBeInTheDocument();
    expect(screen.getByText(/USE THE HAZARD ASSESSMENT PROMPT/)).toBeInTheDocument();
    expect(screen.getByText(/RISK MATRIX · Test Matrix/)).toBeInTheDocument();
    expect(screen.getByText(/TASK \/ HAZARD \/ CONTROL ASSESSMENT/)).toBeInTheDocument();
    expect(screen.getByText(/BASIC JOB STEP/)).toBeInTheDocument();
    expect(screen.getByText('ATTACHMENTS')).toBeInTheDocument();
    expect(screen.queryByText('Procedure References')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add governed procedure')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByLabelText('JSA approval status')).toBeInTheDocument();
  });

  it('shows complete approval history and Return comments while correcting a Returned JSA', async () => {
    const returned = draft();
    returned.versionStatus = 'RETURNED';
    vi.mocked(jsaApi.detail).mockResolvedValue(returned);
    vi.mocked(workflowApi.detail).mockResolvedValue({
      instanceId: 'workflow-1',
      jsaId: '100',
      versionId: '200',
      jsaNumber: 'JSA-100',
      jobTitle: 'Single-page test',
      ownerSiteId: '1',
      rigId: '2',
      departmentId: '3',
      creatorUserId: '10',
      status: 'RETURNED',
      versionStatus: 'RETURNED',
      cycleNumber: 1,
      actions: [
        {
          id: 'action-1',
          action: 'SUBMIT',
          actorUserId: '10',
          actorUsername: 'creator',
          fromStatus: 'DRAFT',
          toStatus: 'DEPARTMENT_HEAD_REVIEW',
          actionAt: '2026-07-29T12:00:00Z',
          cycleNumber: 1,
        },
        {
          id: 'action-2',
          action: 'RETURN',
          actorUserId: '11',
          actorUsername: 'department.head',
          fromStatus: 'DEPARTMENT_HEAD_REVIEW',
          toStatus: 'RETURNED',
          comment: 'Please restore the selected attachments.',
          actionAt: '2026-07-29T12:05:00Z',
          cycleNumber: 1,
        },
      ],
    });

    renderEditor();

    expect(await screen.findByLabelText('Approval history')).toHaveTextContent('Submit');
    expect(screen.getByLabelText('Approval history')).toHaveTextContent('Return');
    expect(screen.getByLabelText('Approval history')).toHaveTextContent('department.head');
    expect(screen.getByLabelText('Approval history')).toHaveTextContent('Department Head Review');
    expect(screen.getByLabelText('Approval history')).toHaveTextContent(
      'Please restore the selected attachments.',
    );
    expect(workflowApi.detail).toHaveBeenCalledWith('100');
  });

  it('browses governed attachments as an Explorer locked to the JSA scope', async () => {
    const user = userEvent.setup();
    vi.mocked(jsaApi.attachmentPicker).mockResolvedValue({
      folders: [
        {
          id: 'folder-1',
          siteId: '1',
          rigId: '2',
          departmentId: '3',
          name: 'Procedures',
          active: true,
          rowVersion: '1',
        },
        {
          id: 'folder-2',
          siteId: '1',
          rigId: '2',
          departmentId: '3',
          parentFolderId: 'folder-1',
          name: 'Cleaning',
          active: true,
          rowVersion: '1',
        },
      ],
      assets: [
        {
          id: 'asset-1',
          folderId: 'folder-2',
          name: 'Accommodation cleaning procedure',
          description: 'Approved cleaning procedure',
          currentVersionId: 'asset-version-1',
          versionNumber: 3,
          originalFileName: 'cleaning-procedure.pdf',
          contentType: 'application/pdf',
          fileSize: '1024',
          sha256: 'test-sha',
          active: true,
          rowVersion: '1',
        },
      ],
    });
    renderEditor();

    await user.click(await screen.findByRole('button', { name: 'Pick attachments' }));

    expect(await screen.findByLabelText('JSA attachment scope')).toHaveTextContent(
      'DEV-RIG — Development Rig',
    );
    expect(screen.getByLabelText('Rig attachment file explorer')).toBeInTheDocument();
    await waitFor(() =>
      expect(jsaApi.attachmentPicker).toHaveBeenCalledWith('siteId=1&rigId=2&departmentId=3'),
    );

    await user.click(screen.getByRole('button', { name: /Procedures/ }));
    await user.click(screen.getByRole('button', { name: /Cleaning/ }));
    expect(await screen.findByText('Accommodation cleaning procedure')).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'Select attachment Accommodation cleaning procedure' }),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByText('cleaning-procedure.pdf')).toBeInTheDocument();
  });

  it('explains a prohibited Residual Risk result in the matrix legend', async () => {
    const value = draft();
    value.matrix.results[0]!.prohibited = true;
    vi.mocked(jsaApi.detail).mockResolvedValue(value);

    renderEditor();

    expect(await screen.findByRole('note')).toHaveTextContent('Not allowed as Residual Risk');
    expect(screen.getByRole('note')).toHaveTextContent(
      'Reduce the risk before submitting for approval.',
    );
    expect(screen.queryByText('Prohibited residual')).not.toBeInTheDocument();
  });

  it('shows configured Risk Colour Overview guidance during JSA authoring', async () => {
    const value = draft();
    value.matrix.results[0] = {
      ...value.matrix.results[0]!,
      description: 'Risk is controlled within the accepted operating range.',
      semanticCategory: 'Acceptable',
      guidanceText: 'Maintain the controls and continue monitoring the task.',
    };
    vi.mocked(jsaApi.detail).mockResolvedValue(value);

    renderEditor();

    expect(await screen.findByLabelText('Risk colour overview')).toHaveTextContent(
      'RISK COLOUR OVERVIEW',
    );
    expect(screen.getByLabelText('Risk colour overview')).toHaveTextContent('Acceptable');
    expect(screen.getByLabelText('Risk colour overview')).toHaveTextContent(
      'Risk is controlled within the accepted operating range.',
    );
    expect(screen.getByLabelText('Risk colour overview')).toHaveTextContent(
      'Maintain the controls and continue monitoring the task.',
    );
  });

  it('embeds the complete worksheet read-only without duplicate page actions', async () => {
    const value = draft();
    value.prompts = [
      {
        id: '250',
        logicalKey: 'prompt-1',
        promptId: '251',
        code: 'HARD_HAT',
        label: 'Hard hat',
        selected: true,
        rowVersion: '1',
      },
    ];
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'Read-only task',
        displayOrder: 1,
        hazards: [
          {
            id: '301',
            logicalKey: 'hazard-1',
            text: 'Read-only hazard',
            displayOrder: 1,
            initialRisk: {},
            residualRisk: {},
            controls: [
              {
                id: '302',
                logicalKey: 'control-1',
                text: 'Read-only control',
                displayOrder: 1,
                rowVersion: '1',
              },
            ],
            rowVersion: '1',
          },
        ],
        rowVersion: '1',
      },
    ];
    value.basicSteps = [
      {
        id: '400',
        logicalKey: 'step-1',
        number: '1',
        text: 'Read-only basic step',
        displayOrder: 1,
        noToolRequired: true,
        performers: [
          {
            id: '401',
            logicalKey: 'performer-1',
            positionId: '402',
            code: 'ROUSTABOUT',
            name: 'Roustabout',
            displayOrder: 1,
            rowVersion: '1',
          },
        ],
        supervisors: [
          {
            id: '403',
            logicalKey: 'supervisor-1',
            positionId: '404',
            code: 'TOOLPUSHER',
            name: 'Toolpusher',
            displayOrder: 1,
            rowVersion: '1',
          },
        ],
        tools: [],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    vi.mocked(jsaApi.options).mockResolvedValue([
      {
        id: '251',
        kind: 'hazard-prompts',
        code: 'HARD_HAT',
        name: 'Hard hat',
        displayOrder: 1,
        active: true,
        rowVersion: '1',
        scopeType: 'GLOBAL',
        attributes: {},
      },
      {
        id: '252',
        kind: 'hazard-prompts',
        code: 'GLOVES',
        name: 'Gloves',
        displayOrder: 2,
        active: true,
        rowVersion: '1',
        scopeType: 'GLOBAL',
        attributes: {},
      },
    ]);

    renderEditor({ embedded: true, forceReadOnly: true });

    expect(await screen.findByLabelText('Complete JSA worksheet')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Single-page test')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Single-page test')).not.toBeDisabled();
    expect(screen.getByLabelText('Task 1')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Hazard 1 for task 1')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Hazard control')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Basic Job Step 1')).toHaveAttribute('readonly');
    expect(screen.getByText('JSA GENERAL INFORMATION')).toBeInTheDocument();
    expect(screen.getByText(/RISK MATRIX · Test Matrix/)).toBeInTheDocument();
    expect(screen.getByText(/TASK \/ HAZARD \/ CONTROL ASSESSMENT/)).toBeInTheDocument();
    expect(screen.getByText(/BASIC JOB STEP/)).toBeInTheDocument();
    expect(screen.getByText('ATTACHMENTS')).toBeInTheDocument();
    expect(await screen.findByText('Hard hat')).toBeInTheDocument();
    expect(screen.getByText('Gloves')).toBeInTheDocument();
    expect(screen.queryByText('Not selected')).not.toBeInTheDocument();
    expect(screen.getByText('Roustabout')).toBeInTheDocument();
    expect(screen.getByText('Toolpusher')).toBeInTheDocument();
    expect(screen.getByText('No tool required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Basic Job Step' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Select performers/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick attachments' })).not.toBeInTheDocument();
    expect(screen.queryByText('Del')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('JSA approval status')).not.toBeInTheDocument();
  });

  it('shows only governed JSA header context and Job Title for authoring', async () => {
    const value = draft();
    value.jobDescription = 'Legacy description';
    value.ptwRequired = true;
    value.ptwReference = 'LEGACY-PTW';
    vi.mocked(jsaApi.detail).mockResolvedValue(value);
    renderEditor();

    expect(await screen.findByText('DEV — JSAMS Local Development')).toBeInTheDocument();
    expect(screen.getByText('DEV-RIG — Development Rig')).toBeInTheDocument();
    expect(screen.getByText('DRILL — Drilling')).toBeInTheDocument();
    expect(screen.queryByText('Owner Site ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Rig ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Department ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Location')).not.toBeInTheDocument();
    expect(screen.queryByText('Personnel')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Description')).not.toBeInTheDocument();
    expect(screen.queryByText('Permit to Work required')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Permit to Work reference')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('JSA-100')).not.toBeInTheDocument();
  });

  it('selects Hazard Assessment Prompts with one click and no coverage mapping', async () => {
    const user = userEvent.setup();
    vi.mocked(jsaApi.options).mockResolvedValue([
      {
        id: '700',
        kind: 'hazard-prompts',
        code: 'ENERGY',
        name: 'Hazardous energy',
        displayOrder: 1,
        active: true,
        rowVersion: '1',
        scopeType: 'GLOBAL',
        attributes: {},
      },
    ]);
    renderEditor();

    const prompt = await screen.findByRole('checkbox', { name: 'Hazardous energy' });
    expect(prompt).not.toBeChecked();
    await user.click(prompt);
    expect(prompt).toBeChecked();
    expect(screen.queryByLabelText('Hazard coverage for Hazardous energy')).not.toBeInTheDocument();
    expect(screen.queryByText('Covered by hazard')).not.toBeInTheDocument();
  });

  it('keeps complete API diagnostics visible when Draft save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(jsaApi.save).mockRejectedValue({
      message: 'ORA-00932: inconsistent datatypes',
      code: 'INTERNAL_ERROR',
      details: ['ORA-00932: inconsistent datatypes'],
      correlationId: 'save-correlation-id',
    });
    renderEditor();

    const jobTitle = await screen.findByDisplayValue('Single-page test');
    await user.type(jobTitle, ' updated');
    await user.click(screen.getAllByRole('button', { name: /Save Draft$/ })[0]!);

    expect(await screen.findByText('Draft save failed — INTERNAL_ERROR')).toBeInTheDocument();
    expect(screen.getAllByText('ORA-00932: inconsistent datatypes')).not.toHaveLength(0);
    expect(screen.getByText('Correlation ID: save-correlation-id')).toBeInTheDocument();
  });

  it('saves Header and Content through one aggregate request', async () => {
    const user = userEvent.setup();
    const initial = draft();
    initial.procedureReferences = [
      {
        id: '910',
        logicalKey: 'legacy-procedure',
        procedureReferenceId: '911',
        code: 'LEGACY',
        title: 'Legacy procedure',
        displayOrder: 1,
        rowVersion: '1',
      },
    ];
    const saved = draft();
    saved.jobTitle = 'Single-page test updated';
    saved.rowVersion = '2';
    saved.versionRowVersion = '3';
    vi.mocked(jsaApi.detail).mockResolvedValue(initial);
    vi.mocked(jsaApi.save).mockResolvedValue(saved);
    renderEditor();

    await user.type(await screen.findByDisplayValue('Single-page test'), ' updated');
    await user.click(screen.getAllByRole('button', { name: /Save Draft$/ })[0]!);

    await screen.findByText('Draft saved');
    expect(jsaApi.save).toHaveBeenCalledTimes(1);
    expect(jsaApi.save).toHaveBeenCalledWith(
      '100',
      expect.objectContaining({
        rowVersion: '1',
        versionRowVersion: '1',
        jobTitle: 'Single-page test updated',
        tasks: [],
        coverage: [],
        procedureReferences: [],
      }),
    );
    const payload = vi.mocked(jsaApi.save).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('jobDescription');
    expect(payload).not.toHaveProperty('ptwRequired');
    expect(payload).not.toHaveProperty('ptwReference');
    expect(jsaApi.header).not.toHaveBeenCalled();
    expect(jsaApi.content).not.toHaveBeenCalled();
  });

  it('offers an explicit latest-version reload after a real concurrency conflict', async () => {
    const user = userEvent.setup();
    vi.mocked(jsaApi.save).mockRejectedValue({
      message: 'Resource was changed by another request',
      code: 'OPTIMISTIC_LOCK_CONFLICT',
      details: [],
      correlationId: 'lock-correlation-id',
    });
    renderEditor();

    await user.type(await screen.findByDisplayValue('Single-page test'), ' updated');
    await user.click(screen.getAllByRole('button', { name: /Save Draft$/ })[0]!);

    expect(await screen.findByRole('button', { name: 'Reload latest' })).toBeInTheDocument();
    expect(screen.getByText('Correlation ID: lock-correlation-id')).toBeInTheDocument();
  });

  it('safely retries a legacy root-only row-version conflict once', async () => {
    const user = userEvent.setup();
    const initial = draft();
    const latest = draft();
    latest.rowVersion = '4';
    latest.versionRowVersion = '6';
    const saved = { ...latest, rowVersion: '5', versionRowVersion: '8' };
    vi.mocked(jsaApi.detail).mockResolvedValueOnce(initial).mockResolvedValueOnce(latest);
    vi.mocked(jsaApi.save)
      .mockRejectedValueOnce({
        message: 'Resource was changed by another request',
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        details: [],
      })
      .mockResolvedValueOnce(saved);
    renderEditor();

    await user.type(await screen.findByDisplayValue('Single-page test'), ' updated');
    await user.click(screen.getAllByRole('button', { name: /Save Draft$/ })[0]!);

    await screen.findByText('Draft saved');
    expect(jsaApi.save).toHaveBeenCalledTimes(2);
    expect(jsaApi.save).toHaveBeenLastCalledWith(
      '100',
      expect.objectContaining({
        rowVersion: '4',
        versionRowVersion: '6',
        jobTitle: 'Single-page test updated',
      }),
    );
  });

  it('shows Probability and Severity references beside the matrix', async () => {
    renderEditor();

    const probability = await screen.findByRole('table', { name: 'PROBABILITY reference' });
    const severity = screen.getByRole('table', { name: 'SEVERITY reference' });

    expect(probability).toHaveTextContent('Probability definition 1');
    expect(severity).toHaveTextContent('Severity definition A');
    expect(screen.getByRole('table', { name: 'Risk Matrix' })).toBeInTheDocument();
    expect(
      screen.getByText('SEVERITY', { selector: '.matrix-chart-severity' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('PROBABILITY', { selector: '.matrix-chart-probability' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Risk colour overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /P — Probability/i })).not.toBeInTheDocument();
  });

  it('deletes the task when its only hazard is removed', async () => {
    const user = userEvent.setup();
    const value = draft();
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'Test task',
        displayOrder: 1,
        hazards: [
          {
            id: '400',
            logicalKey: 'hazard-1',
            text: 'Test hazard',
            displayOrder: 1,
            initialRisk: {},
            residualRisk: {},
            controls: [],
            rowVersion: '1',
          },
        ],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);

    renderEditor();
    await user.click(
      await screen.findByRole('button', { name: 'Delete task and its only hazard' }),
    );

    expect(screen.getByText(/No Task yet/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Test task')).not.toBeInTheDocument();
  });

  it('numbers Tasks only and does not create sub-numbers for Hazards', async () => {
    const value = draft();
    const hazard = (id: string, text: string) => ({
      id,
      logicalKey: `hazard-${id}`,
      text,
      displayOrder: Number(id),
      initialRisk: {},
      residualRisk: {},
      controls: [],
      rowVersion: '1',
    });
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'First task',
        displayOrder: 1,
        hazards: [hazard('1', 'First hazard'), hazard('2', 'Second hazard')],
        rowVersion: '1',
      },
      {
        id: '301',
        logicalKey: 'task-2',
        number: '2',
        title: 'Second task',
        displayOrder: 2,
        hazards: [hazard('3', 'Third hazard')],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);

    renderEditor();

    expect(await screen.findByDisplayValue('First task')).toBeInTheDocument();
    expect(screen.queryByText('1.1')).not.toBeInTheDocument();
    expect(screen.queryByText('1.2')).not.toBeInTheDocument();
    expect(screen.queryByText('2.1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task 1 number')).not.toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'tbody > tr > td:first-child' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'tbody > tr > td:first-child' })).toBeInTheDocument();
  });

  it('inserts and resequences a Task immediately after the selected Task', async () => {
    const user = userEvent.setup();
    const value = draft();
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'First task',
        displayOrder: 1,
        hazards: [],
        rowVersion: '1',
      },
      {
        id: '301',
        logicalKey: 'task-2',
        number: '2',
        title: 'Second task',
        displayOrder: 2,
        hazards: [],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);

    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Insert task after task 1' }));

    expect(screen.getAllByRole('button', { name: /Insert task after task/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Insert task after task 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert task after task 3' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('First task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Second task')).toBeInTheDocument();
  });

  it('keeps exactly one Control editor paired with each Hazard', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole('button', { name: /Add Task/i }));
    expect(screen.getAllByLabelText('Hazard control')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Control/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Hazard' }));
    expect(screen.getAllByLabelText('Hazard control')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Remove control/i })).not.toBeInTheDocument();
  });

  it('selects Initial P/S and Residual P from reference popups and locks Residual S', async () => {
    const user = userEvent.setup();
    const value = draft();
    value.tasks = [
      {
        id: '300',
        logicalKey: 'task-1',
        number: '1',
        title: 'Task',
        displayOrder: 1,
        hazards: [
          {
            id: '301',
            logicalKey: 'hazard-1',
            text: 'Hazard',
            displayOrder: 1,
            initialRisk: { severityId: 'SA' },
            residualRisk: { severityId: 'SA' },
            controls: [
              {
                id: '302',
                logicalKey: 'control-1',
                text: 'Control',
                displayOrder: 1,
                rowVersion: '1',
              },
            ],
            rowVersion: '1',
          },
        ],
        rowVersion: '1',
      },
    ];
    vi.mocked(jsaApi.detail).mockResolvedValue(value);

    renderEditor();

    const initialProbability = await screen.findByRole('button', {
      name: 'initialRisk probability',
    });
    expect(
      screen.queryByRole('combobox', { name: 'initialRisk probability' }),
    ).not.toBeInTheDocument();

    await user.click(initialProbability);
    expect(screen.getByRole('dialog')).toHaveTextContent('P — PROBABILITY');
    expect(document.querySelector('.ant-modal-wrap')).toHaveClass('ant-modal-centered');
    await user.click(
      screen.getByRole('button', {
        name: 'Select probability 2: Probability 2',
      }),
    );
    expect(initialProbability).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'initialRisk severity' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('S — SEVERITY');
    await user.click(
      screen.getByRole('button', {
        name: 'Select severity B: Severity B',
      }),
    );

    const residualSeverity = screen.getByRole('button', {
      name: 'residualRisk severity',
    });
    expect(residualSeverity).toBeDisabled();
    expect(residualSeverity).toHaveTextContent('B');

    const residualProbability = screen.getByRole('button', {
      name: 'residualRisk probability',
    });
    await user.click(residualProbability);
    expect(screen.getByRole('dialog')).toHaveTextContent('P — PROBABILITY');
    await user.click(
      screen.getByRole('button', {
        name: 'Select probability 3: Probability 3',
      }),
    );
    expect(residualProbability).toHaveTextContent('3');
  });
});
