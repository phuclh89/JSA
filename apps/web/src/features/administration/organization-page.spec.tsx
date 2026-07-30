import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TestWrapper } from '../../test/test-wrapper';
import { OrganizationPage } from './organization-page';

describe('OrganizationPage', () => {
  it('lists governed Rigs and exposes Rig creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        return {
          ok: true,
          json: async () =>
            url.includes('scope-options')
              ? [{ id: '1', code: 'DEV', name: 'Development' }]
              : {
                  items: [
                    {
                      id: '2',
                      kind: 'rigs',
                      code: 'DEV-RIG',
                      name: 'Development Rig',
                      siteId: '1',
                      siteCode: 'DEV',
                      siteName: 'Development',
                      active: true,
                      rowVersion: '1',
                    },
                  ],
                  page: 1,
                  pageSize: 20,
                  total: 1,
                },
        };
      }),
    );
    render(
      <TestWrapper>
        <OrganizationPage kind="rigs" />
      </TestWrapper>,
    );

    expect(await screen.findByText('DEV-RIG')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create Rig/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Site')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
  });
});
