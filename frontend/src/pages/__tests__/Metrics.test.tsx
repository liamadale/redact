import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Metrics } from "../Metrics";
import { api } from "../../lib/api";
import { createMockScan, createMockFinding, createMockMetrics } from "../../test/helpers";

vi.mock("../../lib/api", () => ({
  api: {
    getScan: vi.fn(),
    getFindings: vi.fn(),
    getMetrics: vi.fn(),
  },
}));

function renderMetrics(scanId = "scan-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/metrics/${scanId}`]}>
        <Routes>
          <Route path="/metrics/:id" element={<Metrics />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderMetricsNoId() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/metrics"]}>
        <Routes>
          <Route path="/metrics" element={<Metrics />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.getScan).mockResolvedValue(createMockScan({ scan_type: "deep", status: "completed" }));
  vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
  vi.mocked(api.getMetrics).mockResolvedValue(createMockMetrics());
});

describe("Metrics", () => {
  it("shows 'No scan selected' with link when no scanId", async () => {
    renderMetricsNoId();
    await waitFor(() => {
      expect(screen.getByText("No scan selected")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Start a new scan/i })).toBeInTheDocument();
  });

  it("renders aggregate stats from API", async () => {
    vi.mocked(api.getMetrics).mockResolvedValue(
      createMockMetrics({
        total_scans: 42,
        total_repos_scanned: 100,
        total_findings: 7,
        avg_time_to_detect_seconds: 3600,
      })
    );
    renderMetrics();

    expect(await screen.findByText("42")).toBeInTheDocument(); // total_scans
    expect(screen.getByText("100")).toBeInTheDocument(); // repos
    expect(screen.getByText("7")).toBeInTheDocument(); // findings
    // avg time to detect: 3600s = 1h
    expect(screen.getByText("1h")).toBeInTheDocument();
  });

  it("renders per-scan summary stats", async () => {
    const findings = [
      createMockFinding({ severity: "critical", secret_type: "AWS Key" }),
      createMockFinding({ id: "f-2", severity: "high", secret_type: "GitHub Token" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });
    renderMetrics();

    // "Total" stat card
    expect(await screen.findByText("Metrics")).toBeInTheDocument();
  });

  it("shows 'No findings to analyze' when findings are empty", async () => {
    vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
    renderMetrics();

    expect(await screen.findByText("No findings to analyze.")).toBeInTheDocument();
  });

  it("renders repo severity bar chart section when findings exist", async () => {
    const findings = [
      createMockFinding({ repo_name: "org/repo-a", severity: "critical" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });

    renderMetrics();
    expect(await screen.findByText("Findings by Repository")).toBeInTheDocument();
    // Chart section renders (not in empty state)
    expect(screen.queryByText("No findings to analyze.")).not.toBeInTheDocument();
  });

  it("renders verification pie chart when findings exist", async () => {
    const findings = [
      createMockFinding({ verified: true }),
      createMockFinding({ id: "f-2", verified: false }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });

    renderMetrics();
    expect(await screen.findByText("Verification Status")).toBeInTheDocument();
  });

  it("renders top committers chart when author data exists", async () => {
    const findings = [
      createMockFinding({ commit_author: "alice@example.com" }),
      createMockFinding({ id: "f-2", commit_author: "bob@example.com" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });

    renderMetrics();
    expect(await screen.findByText("Top Committers with Leaked Secrets")).toBeInTheDocument();
  });

  it("hides committers chart when there are no findings", async () => {
    vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });

    renderMetrics();
    await screen.findByText("No findings to analyze.");
    expect(screen.queryByText("Top Committers with Leaked Secrets")).not.toBeInTheDocument();
  });
});
