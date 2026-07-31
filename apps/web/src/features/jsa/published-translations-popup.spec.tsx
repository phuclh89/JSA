import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PublishedTranslationsPopup } from './published-translations-popup';
import { translationApi } from './translation-api';

vi.mock('./translation-api', () => ({
  translationApi: {
    publishedForJsa: vi.fn(async () => [
      {
        translationId: '88',
        targetLanguageCode: 'VI',
        targetLanguageName: 'Vietnamese',
        sourceVersionNumber: 3,
        publishedAt: '2026-07-31T00:00:00.000Z',
      },
    ]),
  },
}));

describe('PublishedTranslationsPopup', () => {
  it('loads the published languages only after the user opens the popup', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PublishedTranslationsPopup jsaId="10" jsaNumber="PVD-I-CAT-0001" count={1} permitted />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(translationApi.publishedForJsa).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /1 language/i }));
    expect(await screen.findByText('VI — Vietnamese')).toBeInTheDocument();
    expect(translationApi.publishedForJsa).toHaveBeenCalledWith('10');
  });
});
