import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally not logging to avoid potential PII exposure.
    // Production error monitoring (e.g. Sentry) should be wired up here.
  }

  handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-6 px-4 text-center">
          <AlertTriangle className="h-16 w-16 text-red-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
            <p className="mt-2 text-gray-500">
              An unexpected error occurred. Please reload the page.
            </p>
          </div>
          <Button onClick={this.handleReload}>Reload page</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
