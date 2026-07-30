import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JsaCreatePage } from './jsa-create-page';
import { jsaApi } from './jsa-api';

vi.mock('./jsa-api', () => ({
  jsaApi: {
    options: vi.fn(),
    matrix: vi.fn(),
    create: vi.fn(),
  },
}));

describe('JsaCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jsaApi.options).mockResolvedValue([]);
  });

  it('does not ask for Job Type or Language and explains the English default', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaCreatePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('Owner Site')).toBeInTheDocument();
    expect(screen.getByLabelText('Rig')).toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.queryByLabelText('Job Type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Language/)).not.toBeInTheDocument();
    expect(screen.getByText(/Every source JSA is created in English/)).toBeInTheDocument();

    await waitFor(() => expect(jsaApi.options).toHaveBeenCalledTimes(1));
    expect(jsaApi.options).toHaveBeenCalledWith('sites');
  });

  it('submits only the three owning-context identifiers', async () => {
    vi.mocked(jsaApi.options).mockImplementation(async (kind) => {
      if (kind === 'sites') return [{ id: '1', code: 'DEV', name: 'Development' }];
      if (kind === 'rigs') return [{ id: '2', code: 'RIG', name: 'Development Rig' }];
      return [{ id: '3', code: 'DRILL', name: 'Drilling' }];
    });
    vi.mocked(jsaApi.matrix).mockResolvedValue({
      matrixCode: 'DEV-5X5',
      versionCode: 'DEV-V1',
      dimension: 5,
      completeness: { complete: true },
    } as never);
    vi.mocked(jsaApi.create).mockResolvedValue({ jsaId: '10' } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JsaCreatePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.mouseDown(await screen.findByLabelText('Owner Site'));
    fireEvent.click(await screen.findByText('DEV — Development'));
    fireEvent.mouseDown(await screen.findByLabelText('Rig'));
    fireEvent.click(await screen.findByText('RIG — Development Rig'));
    fireEvent.mouseDown(await screen.findByLabelText('Department'));
    fireEvent.click(await screen.findByText('DRILL — Drilling'));
    fireEvent.click(screen.getByRole('button', { name: 'Open JSA worksheet' }));

    await waitFor(() =>
      expect(jsaApi.create).toHaveBeenCalledWith({
        ownerSiteId: '1',
        rigId: '2',
        departmentId: '3',
      }),
    );
  });
});
