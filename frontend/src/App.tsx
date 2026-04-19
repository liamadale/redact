import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { ScanView } from "./pages/ScanView";
import { Dashboard } from "./pages/Dashboard";

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
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
