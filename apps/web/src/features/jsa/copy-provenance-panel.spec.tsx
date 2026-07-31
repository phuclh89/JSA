import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { copyApi } from './copy-api';
import { CopyProvenancePanel } from './copy-provenance-panel';

vi.mock('./copy-api', () => ({
  copyApi: {
    provenance: vi.fn(),
  },
}));

it('renders nothing when an ordinary JSA has no Copy provenance', async () => {
  vi.mocked(copyApi.provenance).mockResolvedValue(null);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <CopyProvenancePanel jsaId="1000112" />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(copyApi.provenance).toHaveBeenCalledWith('1000112'));
  await waitFor(() => expect(screen.queryByLabelText('Loading copy provenance')).toBeNull());
  expect(screen.queryByText('Copy provenance could not be loaded')).not.toBeInTheDocument();
  expect(container).toBeEmptyDOMElement();
});
