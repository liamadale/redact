import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 2L4 7v9c0 6.5 5.1 12.6 12 14 6.9-1.4 12-7.5 12-14V7L16 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 16l3 3 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const message = this.state.error?.message ?? "An unknown error occurred";
      const truncated = message.length > 200 ? message.slice(0, 200) + "…" : message;

      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <ShieldIcon className="w-12 h-12 text-tokyo-red mx-auto mb-4" />
            <h1 className="text-tokyo-fg text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-tokyo-comment text-sm mb-4">
              An unexpected error occurred while rendering this page.
            </p>
            <pre className="text-tokyo-red text-xs font-mono bg-tokyo-bg-highlight border border-tokyo-border rounded p-3 text-left overflow-x-auto mb-6 whitespace-pre-wrap break-words">
              {truncated}
            </pre>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm bg-tokyo-blue/10 text-tokyo-blue border border-tokyo-blue/30 rounded hover:bg-tokyo-blue/20 transition-colors font-mono"
              >
                Try Again
              </button>
              <Link
                to="/"
                className="px-4 py-2 text-sm bg-tokyo-bg-highlight text-tokyo-fg border border-tokyo-border rounded hover:border-tokyo-comment/50 transition-colors font-mono"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
