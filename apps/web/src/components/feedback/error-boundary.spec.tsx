import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { GlobalErrorBoundary } from './error-boundary';
function Broken(): never {
  throw new Error('broken');
}
it('renders global fallback', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <GlobalErrorBoundary>
      <Broken />
    </GlobalErrorBoundary>,
  );
  expect(screen.getByText('The application could not render this page')).toBeInTheDocument();
});
