import { Link } from "react-router-dom";

interface QueryErrorProps {
  error: Error;
  retry?: () => void;
}

export function QueryError({ error, retry }: QueryErrorProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-4">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        className="text-tokyo-red/60"
        aria-hidden="true"
      >
        <path
          d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-tokyo-red font-mono text-sm">{error.message}</p>
      <div className="flex items-center gap-3">
        {retry && (
          <button
            type="button"
            onClick={retry}
            className="px-4 py-1.5 text-sm font-mono border border-tokyo-border text-tokyo-comment hover:text-tokyo-fg hover:border-tokyo-blue rounded transition-colors"
          >
            Try Again
          </button>
        )}
        <Link to="/" className="text-tokyo-blue hover:underline text-sm font-mono">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
