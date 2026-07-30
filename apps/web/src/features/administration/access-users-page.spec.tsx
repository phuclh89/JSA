import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TestWrapper } from '../../test/test-wrapper';
import { AccessUsersPage } from './access-users-page';

describe('AccessUsersPage', () => {
  it('lists users and presents credential-free registration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              ID: '1',
              USERNAME: 'jsa.user',
              DISPLAY_NAME: 'JSA User',
              EMAIL: 'user@example.test',
              IS_ACTIVE: 'Y',
              ROW_VERSION: '1',
            },
          ],
          total: 1,
          offset: 0,
          limit: 20,
        }),
      }),
    );
    render(
      <TestWrapper>
        <AccessUsersPage />
      </TestWrapper>,
    );
    expect(await screen.findByText('jsa.user')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Register application user/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Authentication credentials are managed by the enterprise identity provider/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Enterprise Identity Key')).toBeInTheDocument();
  });
});
