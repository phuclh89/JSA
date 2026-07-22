import { AppRouter } from './app/router/app-router';
import { GlobalErrorBoundary } from './components/feedback/error-boundary';
export default function App() {
  return (
    <GlobalErrorBoundary>
      <AppRouter />
    </GlobalErrorBoundary>
  );
}
