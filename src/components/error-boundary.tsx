"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-dvh flex items-center justify-center bg-off-white p-6">
          <div className="text-center max-w-sm">
            <RefreshCw className="w-10 h-10 text-text-muted mx-auto mb-4" />
            <h2 className="text-lg font-bold text-text mb-2">Something went wrong</h2>
            <p className="text-sm text-text-muted mb-4">
              Try refreshing the page. If the problem persists, check your connection.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="py-2 px-6 bg-navy text-white rounded-lg font-bold text-sm hover:bg-navy-light transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
