import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { TestWrapper } from '../../test/test-wrapper';
import { MasterDataPage } from './master-data-page';

describe('MasterDataPage', () => {
  it('renders server data, filters, and inactive state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: '100000000000001',
              kind: 'positions',
              code: 'DRILLER',
              name: 'Driller',
              displayOrder: 1,
              scopeType: 'GLOBAL',
              active: false,
              rowVersion: '2',
              attributes: { alternateName: 'Driller' },
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      }),
    );
    render(
      <TestWrapper>
        <MasterDataPage kind="positions" />
      </TestWrapper>,
    );
    expect(await screen.findByText('DRILLER')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Scope')).toBeInTheDocument();
  });

  it('shows a safe system error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    render(
      <TestWrapper>
        <MasterDataPage kind="tools" />
      </TestWrapper>,
    );
    expect(await screen.findByText('Unable to load master data')).toBeInTheDocument();
  });
});
