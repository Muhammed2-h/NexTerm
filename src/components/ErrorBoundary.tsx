import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-red-950/20 rounded-2xl border border-red-500/20 p-6 text-center">
          <div className="text-red-400 mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Terminal Render Error</h2>
          <p className="text-red-200/70 text-sm mb-6 max-w-md">
            {this.state.error?.message ||
              'An unexpected error occurred while rendering the terminal.'}
          </p>
          <button
            onClick={this.handleReload}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded border border-red-500/30 transition-colors cursor-pointer"
          >
            Reload Terminal
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
