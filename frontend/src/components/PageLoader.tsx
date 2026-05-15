export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-tokyo-comment">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          className="animate-pulse text-tokyo-blue/60"
          aria-hidden="true"
        >
          <path
            d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm font-mono animate-pulse">Loading...</span>
      </div>
    </div>
  );
}
