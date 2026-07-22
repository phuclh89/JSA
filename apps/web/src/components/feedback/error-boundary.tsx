import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button } from 'antd';
export class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI render failure', {
      message: error.message,
      componentStack: info.componentStack,
    });
  }
  render() {
    return this.state.hasError ? (
      <Alert
        type="error"
        showIcon
        message="The application could not render this page"
        action={<Button onClick={() => location.reload()}>Reload</Button>}
      />
    ) : (
      this.props.children
    );
  }
}
