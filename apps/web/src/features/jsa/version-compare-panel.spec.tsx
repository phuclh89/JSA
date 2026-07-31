import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { VersionComparePanel } from './version-compare-panel';

vi.mock('./versioning-api', () => ({
  versioningApi: {
    compare: vi.fn(async () => ({
      jsaId: '10',
      baseVersionId: '100',
      workingVersionId: '101',
      summary: { ADDED: 1, MODIFIED: 1, DELETED: 0, MOVED: 1, UNCHANGED: 1 },
      changes: [
        {
          entityType: 'HEADER',
          logicalKey: 'HEADER',
          changeType: 'MODIFIED',
          label: 'General Information',
          fields: [{ field: 'jobTitle', oldValue: 'Old job', newValue: 'New job' }],
        },
        {
          entityType: 'TASK',
          logicalKey: 'task-1',
          changeType: 'MOVED',
          label: 'Prepare',
          fields: [],
          oldPosition: 'ROOT:1',
          newPosition: 'ROOT:2',
        },
        {
          entityType: 'CONTROL',
          logicalKey: 'control-2',
          changeType: 'ADDED',
          label: 'Use barrier',
          fields: [],
        },
        {
          entityType: 'PROMPT',
          logicalKey: 'prompt-1',
          changeType: 'UNCHANGED',
          label: 'Dropped object',
          fields: [],
        },
      ],
    })),
    reviewCompare: vi.fn(),
  },
}));

it('renders section-aware inline changes and hides unchanged rows by default', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VersionComparePanel jsaId="10" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('General Information')).toBeInTheDocument();
  expect(screen.getByText('Old job')).toBeInTheDocument();
  expect(screen.getByText('New job')).toBeInTheDocument();
  expect(screen.getByText('Prepare')).toBeInTheDocument();
  expect(screen.getByText('Use barrier')).toBeInTheDocument();
  expect(screen.queryByText('Dropped object')).not.toBeInTheDocument();
  expect(screen.getByText('MODIFIED: 1')).toBeInTheDocument();
});
