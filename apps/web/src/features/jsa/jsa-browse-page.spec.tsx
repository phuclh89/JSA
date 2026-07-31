import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { JsaBrowsePage } from './jsa-browse-page';
import { browseApi } from './browse-api';
import { copyApi } from './copy-api';
import { jsaApi } from './jsa-api';
import { versioningApi } from './versioning-api';

vi.mock('./rig-context', () => ({
  useRigContext: () => ({ selectedRigId: '2' }),
}));
vi.mock('./browse-api', () => ({
  browseApi: {
    list: vi.fn(async (parameters: { kind: string }) => ({
      items: [
        {
          jsaId: '10',
          versionId: '11',
          jsaNumber: 'PVD-I-DR-0001',
          jobTitle: 'Lift pump',
          ownerSiteId: '1',
          ownerSiteCode: 'OFFSHORE',
          ownerSiteName: 'Offshore',
          rigId: '2',
          rigCode: 'PVD-I',
          rigName: 'PV DRILLING I',
          departmentId: '3',
          departmentCode: 'DR',
          departmentName: 'Drilling',
          currentStatus: 'PUBLISHED',
          workingStatus: undefined,
          displayStatus: 'PUBLISHED',
          matrixVersionId: '4',
          creatorUsername: 'creator',
          updatedAt: '2026-07-30T00:00:00Z',
          createdAt: '2026-07-20T00:00:00Z',
          favorite: parameters.kind === 'favorites',
          publishedTranslationCount: 0,
          matchedFields: ['JOB_TITLE'],
          matchedVersionKinds: ['CURRENT'],
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    })),
    capabilities: vi.fn(async () => ({
      view: true,
      favorite: true,
      favoriteConfigured: true,
    })),
    facets: vi.fn(async () => ({ sites: [], departments: [], matrixVersions: [] })),
    favorite: vi.fn(async () => ({ jsaId: '10', favorite: true, changed: true })),
    unfavorite: vi.fn(),
  },
}));
vi.mock('./copy-api', () => ({
  copyApi: {
    capabilities: vi.fn(async () => ({
      view: true,
      create: true,
      copy: true,
      configured: true,
    })),
    destinations: vi.fn(async () => ({
      localSite: { id: '1', code: 'OFFSHORE', name: 'Offshore' },
      rigs: [{ id: '4', code: 'PVD-II', name: 'PV DRILLING II', siteId: '1' }],
      departments: [
        {
          id: '5',
          code: 'DR',
          name: 'Drilling',
          siteId: '1',
          rigId: '4',
        },
      ],
    })),
  },
}));
vi.mock('./translation-api', () => ({
  translationApi: {
    capabilities: vi.fn(async () => ({
      view: true,
      assign: true,
      translate: true,
      approve: true,
      print: true,
      configured: true,
    })),
  },
}));
vi.mock('./jsa-api', () => ({
  jsaApi: {
    capabilities: vi.fn(async () => ({
      view: true,
      create: true,
      edit: true,
      cancel: true,
      submit: true,
    })),
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
    checkout: vi.fn(async () => ({
      jsaId: '10',
      baseVersionId: '11',
      workingVersionId: '12',
      matrixChanged: false,
    })),
    undo: vi.fn(async () => ({ status: 'PUBLISHED' })),
  },
}));
vi.mock('./jsa-create-page', () => ({
  JsaCreateModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Create JSA modal</div> : null,
}));

describe('JsaBrowsePage', () => {
  it('uses server-side search and keeps Favorite as a ribbon action', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="all" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('PVD-I-DR-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /favorite/i })).toBeDisabled();

    fireEvent.click(screen.getByText('PVD-I-DR-0001'));
    expect(screen.getByRole('button', { name: /favorite/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^copy/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
    expect(await screen.findByText('Copy JSA to another Rig')).toBeInTheDocument();
    expect(await screen.findByText('Source Current Published JSA')).toBeInTheDocument();
    expect((await screen.findAllByText('PV DRILLING I')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: /favorite/i }));
    await waitFor(() => expect(browseApi.favorite).toHaveBeenCalledWith('10'));

    fireEvent.change(screen.getByPlaceholderText('Search JSA'), {
      target: { value: 'pump' },
    });
    await waitFor(
      () =>
        expect(browseApi.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ keyword: 'pump', searchField: 'ALL', rigId: '2' }),
        ),
      { timeout: 1000 },
    );
  }, 10_000);

  it('does not expose Copy in owner/workflow queues', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="drafts" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('PVD-I-DR-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^copy/i })).not.toBeInTheDocument();
    expect(copyApi.capabilities).toHaveBeenCalled();
  });

  it('keeps Create JSA available from the Published JSA ribbon', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="published" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const create = await screen.findByRole('button', { name: 'Create JSA' });
    expect(create).toBeEnabled();
    expect(jsaApi.capabilities).toHaveBeenCalled();
    fireEvent.click(create);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Create JSA modal');
  });

  it('checks out a selected Published JSA and starts its Working Version editor', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="published" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('PVD-I-DR-0001')).toBeInTheDocument();
    const checkout = screen.getByRole('button', { name: /Checkout JSA/i });
    expect(checkout).toBeDisabled();

    fireEvent.click(screen.getByText('PVD-I-DR-0001'));
    expect(checkout).toBeEnabled();
    fireEvent.click(checkout);
    fireEvent.click(await screen.findByRole('button', { name: 'Checkout and Edit' }));

    await waitFor(() => expect(versioningApi.checkout).toHaveBeenCalledWith('10'));
  });

  it('keeps structured filters collapsed until Advanced Search is opened', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="published" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('PVD-I-DR-0001')).toBeInTheDocument();
    expect(screen.queryByText('Owner Site')).not.toBeInTheDocument();
    expect(screen.queryByText('Matrix Version')).not.toBeInTheDocument();

    const advancedSearch = screen.getByRole('button', { name: /Advanced Search/i });
    expect(advancedSearch).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(advancedSearch);

    expect(await screen.findByText('Owner Site')).toBeInTheDocument();
    expect(screen.getByText('Matrix Version')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide Advanced Search/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('loads the signed-in user favorites on the dedicated My Favorites page', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="favorites" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'My Favorites' })).toBeInTheDocument();
    expect(await screen.findByText('PVD-I-DR-0001')).toBeInTheDocument();
    expect(browseApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'favorites', rigId: '2' }),
    );

    fireEvent.click(screen.getByText('PVD-I-DR-0001'));
    expect(screen.getByRole('button', { name: 'Unfavorite' })).toBeEnabled();
  });

  it('undoes an unsubmitted checkout from the JSA ribbon', async () => {
    vi.mocked(browseApi.list).mockResolvedValueOnce({
      items: [
        {
          jsaId: '10',
          versionId: '12',
          jsaNumber: 'PVD-I-DR-0001',
          jobTitle: 'Lift pump',
          ownerSiteId: '1',
          ownerSiteCode: 'OFFSHORE',
          ownerSiteName: 'Offshore',
          rigId: '2',
          rigCode: 'PVD-I',
          rigName: 'PV DRILLING I',
          departmentId: '3',
          departmentCode: 'DR',
          departmentName: 'Drilling',
          currentStatus: 'PUBLISHED',
          workingStatus: 'DRAFT',
          displayStatus: 'DRAFT',
          matrixVersionId: '4',
          creatorUsername: 'creator',
          updatedAt: '2026-07-30T00:00:00Z',
          createdAt: '2026-07-20T00:00:00Z',
          favorite: false,
          publishedTranslationCount: 0,
          matchedFields: ['JOB_TITLE'],
          matchedVersionKinds: ['CURRENT', 'WORKING'],
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaBrowsePage kind="published" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText('PVD-I-DR-0001'));
    const undo = screen.getByRole('button', { name: 'Undo Checkout' });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo Checkout' }));

    await waitFor(() =>
      expect(versioningApi.undo).toHaveBeenCalledWith('10', 'Discarded before workflow submission'),
    );
  });
});
