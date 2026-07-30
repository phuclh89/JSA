import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyDraftsPage } from './my-drafts-page';
import { jsaApi } from './jsa-api';

vi.mock('./jsa-api', () => ({
  jsaApi: {
    myDrafts: vi.fn(),
    capabilities: vi.fn(),
  },
}));
vi.mock('./rig-context', () => ({
  useRigContext: () => ({ selectedRigId: undefined }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/jsa/drafts']}>
        <Routes>
          <Route path="/jsa/drafts" element={<MyDraftsPage />} />
          <Route path="/jsa/:id/draft" element={<div>Draft editor opened</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MyDraftsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jsaApi.capabilities).mockResolvedValue({
      view: true,
      create: true,
      edit: true,
      cancel: true,
      configured: true,
    });
  });

  it('lists creator-owned Drafts and opens the selected worksheet', async () => {
    const user = userEvent.setup();
    vi.mocked(jsaApi.myDrafts).mockResolvedValue([
      {
        jsaId: '10',
        versionId: '20',
        jsaNumber: 'DEV-10',
        jobTitle: 'Repair pump',
        versionStatus: 'DRAFT',
        ownerSiteCode: 'DEV',
        ownerSiteName: 'Development',
        rigCode: 'DEV-RIG',
        rigName: 'Development Rig',
        departmentCode: 'DRILL',
        departmentName: 'Drilling',
        updatedAt: '2026-07-24T00:00:00.000Z',
      },
    ]);
    renderPage();

    expect(await screen.findByText('DEV-10')).toBeInTheDocument();
    expect(screen.getByText('Repair pump')).toBeInTheDocument();
    expect(screen.getByText('Development Rig')).toBeInTheDocument();
    await user.click(screen.getByText('DEV-10'));
    await user.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(screen.getByText('Draft editor opened')).toBeInTheDocument();
  });

  it('shows an actionable empty state', async () => {
    vi.mocked(jsaApi.myDrafts).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('You have no Draft or Returned JSA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue editing' })).toBeDisabled();
  });
});
