import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { FindingDetail } from "./pages/FindingDetail";
import { Landing } from "./pages/Landing";
import { Metrics } from "./pages/Metrics";
import { Report } from "./pages/Report";
import { ScanView } from "./pages/ScanView";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

function Nav() {
  return (
    <nav className="fixed top-0 w-full bg-tokyo-bg/80 backdrop-blur border-b border-tokyo-border z-50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6">
        <Link to="/" className="text-tokyo-fg font-bold text-lg">
          Redact
        </Link>
        <Link
          to="/dashboard"
          className="text-tokyo-comment hover:text-tokyo-fg text-sm"
        >
          Dashboard
        </Link>
        <Link
          to="/metrics"
          className="text-tokyo-comment hover:text-tokyo-fg text-sm"
        >
          Metrics
        </Link>
      </div>
    </nav>
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/metrics" element={<Metrics />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
