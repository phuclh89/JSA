import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccessDeniedPage, NotFoundPage } from './pages';
it('renders Access Denied', () => {
  render(
    <MemoryRouter>
      <AccessDeniedPage />
    </MemoryRouter>,
  );
  expect(screen.getByText('Access Denied')).toBeInTheDocument();
});
it('renders Not Found', () => {
  render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
  expect(screen.getByText('Page Not Found')).toBeInTheDocument();
});
