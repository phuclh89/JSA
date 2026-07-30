import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { WorkflowQueuePage } from './workflow-queue-page';
import { WorkflowReviewPage } from './workflow-review-page';
vi.mock('./jsa-draft-editor', () => ({
  JsaDraftEditor: ({
    embedded,
    forceReadOnly,
  }: {
    embedded?: boolean;
    forceReadOnly?: boolean;
  }) => (
    <div
      aria-label="Complete JSA worksheet"
      data-embedded={String(embedded)}
      data-read-only={String(forceReadOnly)}
    >
      Embedded JSA worksheet
    </div>
  ),
}));
vi.mock('./workflow-api', () => ({
  workflowApi: {
    queue: vi.fn(async () => [
      {
        instanceId: '1',
        jsaId: '10',
        jsaNumber: 'JSA-10',
        jobTitle: 'Lift equipment',
        ownerSiteCode: 'DEV',
        ownerSiteName: 'Development',
        rigCode: 'DEV-RIG',
        rigName: 'Development Rig',
        departmentCode: 'DRILL',
        departmentName: 'Drilling',
        versionStatus: 'STC_REVIEW',
        currentStepName: 'STC',
        publishedAt: '2026-07-23T00:00:00Z',
        publishedByUsername: 'oim.user',
        updatedAt: '2026-07-23T00:00:00Z',
      },
    ]),
    detail: vi.fn(async () => ({
      instanceId: '1',
      jsaId: '10',
      versionId: '11',
      jsaNumber: 'JSA-10',
      jobTitle: 'Lift equipment',
      ownerSiteId: '1',
      rigId: '2',
      departmentId: '3',
      creatorUserId: '8',
      status: 'ACTIVE',
      versionStatus: 'STC_REVIEW',
      currentStepOrder: 2,
      cycleNumber: 1,
      currentTaskId: '20',
      currentAssigneeUserId: '9',
      currentStepName: 'STC',
      actions: [
        {
          id: '30',
          action: 'SUBMIT',
          actorUserId: '8',
          actorUsername: 'creator',
          fromStatus: 'DRAFT',
          toStatus: 'DEPARTMENT_HEAD_REVIEW',
          actionAt: '2026-07-23T00:00:00Z',
          cycleNumber: 1,
        },
      ],
    })),
    preview: vi.fn(async () => ({
      configured: true,
      steps: [
        {
          stepId: '11',
          stepOrder: 1,
          stepCode: 'DEPARTMENT_HEAD',
          stepName: 'Department Head',
          versionStatus: 'DEPARTMENT_HEAD_REVIEW',
          workflowRoleCode: 'DEPARTMENT_HEAD',
          assigneeUserId: '8',
          assigneeName: 'Department Head User',
        },
        {
          stepId: '12',
          stepOrder: 2,
          stepCode: 'STC',
          stepName: 'STC',
          versionStatus: 'STC_REVIEW',
          workflowRoleCode: 'STC',
          assigneeUserId: '9',
          assigneeName: 'STC User',
        },
        {
          stepId: '13',
          stepOrder: 3,
          stepCode: 'OIM',
          stepName: 'OIM',
          versionStatus: 'OIM_REVIEW',
          workflowRoleCode: 'OIM',
          assigneeUserId: '10',
          assigneeName: 'OIM User',
        },
      ],
      errors: [],
    })),
    action: vi.fn(),
  },
}));
vi.mock('./jsa-api', () => ({
  jsaApi: {
    capabilities: vi.fn(async () => ({
      configured: true,
      view: true,
      create: true,
      edit: true,
      cancel: true,
    })),
  },
}));
vi.mock('./rig-context', () => ({
  useRigContext: () => ({ selectedRigId: undefined }),
}));
vi.mock('../auth/auth-context', () => ({ useCurrentUser: () => ({ userId: '9' }) }));
const wrapper = (ui: React.ReactNode, path = '/') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
describe('Phase 4 workflow pages', () => {
  it('shows the Needs Approval queue with current governed step', async () => {
    wrapper(<WorkflowQueuePage kind="approvals" />);
    expect(await screen.findByText('JSA-10')).toBeInTheDocument();
    expect(screen.getByText('STC')).toBeInTheDocument();
  });
  it('shows the legacy-familiar Published JSA workspace', async () => {
    wrapper(<WorkflowQueuePage kind="published" />);
    expect(await screen.findByRole('heading', { name: 'Published JSA' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Published JSA operations' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'JSA folders' })).not.toBeInTheDocument();
    expect(screen.getByText('JSA-10')).toBeInTheDocument();
    expect(screen.getByText('Development Rig')).toBeInTheDocument();
    expect(screen.getByText('Drilling')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print JSA' })).toBeDisabled();
    expect(screen.getByText('oim.user')).toBeInTheDocument();
  });
  it('shows review history and assigned approver actions', async () => {
    wrapper(
      <Routes>
        <Route path="/jsa/:id/workflow" element={<WorkflowReviewPage />} />
      </Routes>,
      '/jsa/10/workflow',
    );
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByLabelText('Approval history')).toHaveTextContent('Submit');
    expect(screen.queryByText('Open read-only JSA')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Complete JSA worksheet')).toHaveAttribute(
      'data-embedded',
      'true',
    );
    expect(screen.getByLabelText('Complete JSA worksheet')).toHaveAttribute(
      'data-read-only',
      'true',
    );
    expect(screen.getByLabelText('JSA approval status')).toBeInTheDocument();
    expect(screen.getAllByText('Department Head').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STC').length).toBeGreaterThan(0);
  });
});
