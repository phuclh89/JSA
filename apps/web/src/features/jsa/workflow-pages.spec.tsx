import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { WorkflowQueuePage } from './workflow-queue-page';
import { WorkflowReviewPage } from './workflow-review-page';
vi.mock('./workflow-api', () => ({
  workflowApi: {
    queue: vi.fn(async () => [
      {
        instanceId: '1',
        jsaId: '10',
        jsaNumber: 'JSA-10',
        jobTitle: 'Lift equipment',
        versionStatus: 'STC_REVIEW',
        currentStepName: 'STC',
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
    action: vi.fn(),
  },
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
  it('shows review history and assigned approver actions', async () => {
    wrapper(
      <Routes>
        <Route path="/jsa/:id/workflow" element={<WorkflowReviewPage />} />
      </Routes>,
      '/jsa/10/workflow',
    );
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByText(/SUBMIT/)).toBeInTheDocument();
    expect(screen.getByText('Open read-only JSA')).toBeInTheDocument();
  });
});
