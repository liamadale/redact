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
      <circle cx="16" cy="14" r="3" fill="currentColor" />
      <rect x="14.5" y="16.5" width="3" height="4.5" rx="1" fill="currentColor" />
    </svg>
  );
}

export function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 bg-tokyo-bg">
      <div className="max-w-md w-full text-center">
        <ShieldIcon className="w-12 h-12 text-tokyo-comment mx-auto mb-6" />
        <h1 className="text-8xl font-bold text-tokyo-red font-mono mb-4">404</h1>
        <h2 className="text-tokyo-fg text-xl font-semibold mb-3">Page not found</h2>
        <p className="text-tokyo-comment text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-block px-5 py-2.5 text-sm bg-tokyo-blue/10 text-tokyo-blue border border-tokyo-blue/30 rounded hover:bg-tokyo-blue/20 transition-colors font-mono"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
