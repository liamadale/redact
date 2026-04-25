import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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
          <Link to="/" className="text-tokyo-fg font-bold shrink-0 hover:text-tokyo-blue transition-colors">
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
