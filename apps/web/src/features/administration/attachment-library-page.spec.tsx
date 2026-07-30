import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TestWrapper } from '../../test/test-wrapper';
import { AttachmentLibraryPage } from './attachment-library-page';

describe('AttachmentLibraryPage', () => {
  it('selects only Site and Rig, then browses Departments and folders in an explorer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        const body = url.includes('type=SITE')
          ? [{ id: '1', code: 'DEV', name: 'Development Site' }]
          : url.includes('type=RIG')
            ? [{ id: '2', code: 'RIG-A', name: 'Rig Alpha', siteId: '1' }]
            : url.includes('type=DEPARTMENT')
              ? [
                  {
                    id: '3',
                    code: 'DRILL',
                    name: 'Drilling',
                    siteId: '1',
                    rigId: '2',
                  },
                ]
              : url.includes('/attachment-library?')
                ? {
                    folders: [
                      {
                        id: '10',
                        siteId: '1',
                        rigId: '2',
                        departmentId: '3',
                        name: 'Procedures',
                        active: true,
                        rowVersion: '1',
                      },
                    ],
                    assets: [],
                  }
                : {};
        return { ok: true, status: 200, json: async () => body };
      }),
    );

    render(
      <TestWrapper>
        <AttachmentLibraryPage />
      </TestWrapper>,
    );

    const siteSelect = screen.getByRole('combobox', { name: 'Attachment Site' });
    const rigSelect = screen.getByRole('combobox', { name: 'Attachment Rig' });
    expect(siteSelect).toBeInTheDocument();
    expect(rigSelect).toBeInTheDocument();
    expect(screen.queryByLabelText('Attachment Department')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Attachment Folder')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(siteSelect);
    await user.click(await screen.findByText('DEV — Development Site'));
    await user.click(rigSelect);
    await user.click(await screen.findByText('RIG-A — Rig Alpha'));

    const explorer = await screen.findByLabelText('Attachment file explorer');
    expect(await within(explorer).findByText('DRILL — Drilling')).toBeInTheDocument();
    expect(within(explorer).getAllByText('Procedures').length).toBeGreaterThan(0);

    fireEvent.change(within(explorer).getByLabelText('Filter current folder'), {
      target: { value: 'missing' },
    });
    expect(await within(explorer).findByText('No matching folders or files')).toBeInTheDocument();
  });
});
