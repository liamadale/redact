import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "../Dashboard";
import { api } from "../../lib/api";
import { createMockScan, createMockFinding } from "../../test/helpers";

vi.mock("../../lib/api", () => ({
  api: {
    getScan: vi.fn(),
    getFindings: vi.fn(),
  },
}));

function renderDashboard(scanId = "scan-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/${scanId}`]}>
        <Routes>
          <Route path="/dashboard/:id" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderDashboardNoId() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
});

describe("Dashboard", () => {
  it("shows loading spinner while fetching scan data", () => {
    vi.mocked(api.getScan).mockImplementation(() => new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText("Loading dashboard...")).toBeInTheDocument();
  });

  it("renders summary cards with correct counts after load", async () => {
    const findings = [
      createMockFinding({ severity: "critical", verified: true, repo_name: "org/a" }),
      createMockFinding({ id: "f-2", severity: "high", verified: false, repo_name: "org/b" }),
    ];
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ scan_type: "deep", status: "completed" }));
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });

    renderDashboard();
    await screen.findByText("Dashboard");

    // Check each stat card label is present
    expect(screen.getByText("Total Findings")).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    expect(screen.getByText("Verified Active")).toBeInTheDocument();
    expect(screen.getByText("Repos Affected")).toBeInTheDocument();
  });

  it("renders chart section headings when findings exist", async () => {
    const findings = [
      createMockFinding({ commit_date: "2024-03-15T00:00:00Z", secret_type: "AWS Key" }),
    ];
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ scan_type: "deep", status: "completed" }));
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });

    renderDashboard();
    expect(await screen.findByText("Secrets by Commit Date")).toBeInTheDocument();
    expect(screen.getByText("Secret Type Distribution")).toBeInTheDocument();
  });

  it("shows empty state (no charts section) when no findings", async () => {
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ scan_type: "deep", status: "completed" }));
    vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });

    renderDashboard();
    await screen.findByText("Dashboard");
    expect(screen.queryByText("Secrets by Commit Date")).not.toBeInTheDocument();
  });

  it("shows 'No scan selected' with link to home when no data", async () => {
    // No scanId in URL → query is disabled → scan stays undefined
    renderDashboardNoId();
    await waitFor(() => {
      expect(screen.getByText("No scan selected")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Start a new scan/i })).toBeInTheDocument();
  });

  it("renders repo breakdown table", async () => {
    const findings = [
      createMockFinding({ repo_name: "org/repo-a" }),
      createMockFinding({ id: "f-2", repo_name: "org/repo-b" }),
    ];
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ scan_type: "deep", status: "completed" }));
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });

    renderDashboard();
    expect(await screen.findByText("org/repo-a")).toBeInTheDocument();
    expect(screen.getByText("org/repo-b")).toBeInTheDocument();
  });
});
