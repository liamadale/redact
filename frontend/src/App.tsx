import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

function ShieldLockIcon({ className }: { className?: string }) {
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
import { BrowserRouter, Routes, Route, Link, useLocation, matchPath } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { FindingDetail } from "./pages/FindingDetail";
import { Landing } from "./pages/Landing";
import { Metrics } from "./pages/Metrics";
import { Report } from "./pages/Report";
import { ScanView } from "./pages/ScanView";
import { api } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

const STATUS_DOT: Record<string, string> = {
  queued: "bg-tokyo-blue animate-pulse",
  running: "bg-tokyo-yellow animate-pulse",
  completed: "bg-tokyo-green",
  partial: "bg-tokyo-yellow",
  failed: "bg-tokyo-red",
};

function useScanIdFromRoute(): string | null {
  const { pathname } = useLocation();
  const patterns = [
    "/scans/:id",
    "/scans/:id/findings/:findingId",
    "/scans/:id/report",
    "/dashboard/:id",
    "/metrics/:id",
  ];
  for (const pattern of patterns) {
    const match = matchPath(pattern, pathname);
    if (match?.params.id) return match.params.id;
  }
  return null;
}

function usePageLabel(): string | null {
  const { pathname } = useLocation();
  if (matchPath("/dashboard/:id", pathname)) return "Dashboard";
  if (matchPath("/metrics/:id", pathname)) return "Metrics";
  if (matchPath("/scans/:id/report", pathname)) return "Report";
  if (matchPath("/scans/:id/findings/:findingId", pathname)) return "Finding";
  if (matchPath("/scans/:id", pathname)) return "Scan";
  return null;
}

function Nav() {
  const scanId = useScanIdFromRoute();
  const pageLabel = usePageLabel();

  const { data: scan } = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const dotClass = scan ? STATUS_DOT[scan.status] ?? "bg-tokyo-comment" : "";

  return (
    <nav className="fixed top-0 w-full bg-tokyo-bg/80 backdrop-blur border-b border-tokyo-border z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Left: logo + breadcrumbs */}
        <div className="flex items-center gap-0 text-sm min-w-0">
          <Link to="/" className="flex items-center gap-1.5 text-tokyo-fg font-bold shrink-0 hover:text-tokyo-blue transition-colors">
            <ShieldLockIcon className="w-4 h-4" />
            Redact
          </Link>

          {scan && (
            <>
              <span className="text-tokyo-border mx-2 shrink-0">/</span>
              <Link
                to={`/scans/${scanId}`}
                className="text-tokyo-comment hover:text-tokyo-fg transition-colors truncate max-w-48 font-mono text-xs"
              >
                {scan.target_name}
              </Link>
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ml-2 ${dotClass}`} />
            </>
          )}

          {pageLabel && pageLabel !== "Scan" && (
            <>
              <span className="text-tokyo-border mx-2 shrink-0">/</span>
              <span className="text-tokyo-fg text-xs font-medium shrink-0">{pageLabel}</span>
            </>
          )}
        </div>

        {/* Right: context actions */}
        <div className="flex items-center gap-2 shrink-0">
          {scan && scanId && scan.scan_type === "deep" && (
            <>
              <NavLink to={`/scans/${scanId}`} label="Scan" />
              <NavLink to={`/dashboard/${scanId}`} label="Dashboard" />
              <NavLink to={`/metrics/${scanId}`} label="Metrics" />
              <NavLink to={`/scans/${scanId}/report`} label="Report" />
              <span className="w-px h-4 bg-tokyo-border mx-1" />
            </>
          )}
          <Link
            to="/"
            className="px-3 py-1.5 text-[11px] bg-tokyo-green/90 text-tokyo-bg font-bold rounded hover:bg-tokyo-green transition-colors"
          >
            + New Scan
          </Link>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const isActive = pathname === to;
  return (
    <Link
      to={to}
      className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
        isActive
          ? "text-tokyo-fg bg-white/[0.06]"
          : "text-tokyo-comment hover:text-tokyo-fg"
      }`}
    >
      {label}
    </Link>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Nav />
        <div className="pt-14">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/scans/:id" element={<ScanView />} />
            <Route path="/scans/:scanId/findings/:findingId" element={<FindingDetail />} />
            <Route path="/scans/:scanId/report" element={<Report />} />
            <Route path="/dashboard/:id" element={<Dashboard />} />
            <Route path="/metrics/:id" element={<Metrics />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
