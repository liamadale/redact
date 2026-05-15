import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ScanView } from "../ScanView";
import { api } from "../../lib/api";
import { useScanStore } from "../../stores/scanStore";
import { createMockScan, createMockFinding, createMockHit } from "../../test/helpers";

vi.mock("../../lib/api", () => ({
  api: {
    getScan: vi.fn(),
    getFindings: vi.fn(),
    getHits: vi.fn(),
  },
}));

vi.mock("../../hooks/useSSE", () => ({ useSSE: vi.fn() }));

function renderScanView(scanId = "scan-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/scans/${scanId}`]}>
        <Routes>
          <Route path="/scans/:id" element={<ScanView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useScanStore.setState({ logs: [], connectionStatus: "disconnected", currentScanId: null });
  vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
  vi.mocked(api.getHits).mockResolvedValue({ hits: [], total: 0 });
});

describe("ScanView", () => {
  it("shows loading state when scan data is loading", () => {
    vi.mocked(api.getScan).mockImplementation(() => new Promise(() => {}));
    renderScanView();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders scan header with target name after load", async () => {
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ target_name: "my-org" }));
    renderScanView();
    expect(await screen.findByText("my-org")).toBeInTheDocument();
  });

  it("shows COMPLETED status badge", async () => {
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ status: "completed" }));
    renderScanView();
    expect(await screen.findByText("COMPLETED")).toBeInTheDocument();
  });

  it("shows FAILED status badge", async () => {
    vi.mocked(api.getScan).mockResolvedValue(createMockScan({ status: "failed" }));
    renderScanView();
    expect(await screen.findByText("FAILED")).toBeInTheDocument();
  });

  it("shows RUNNING status badge", async () => {
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ status: "running", repos_total: 3, repos_scanned: 1 })
    );
    renderScanView();
    expect(await screen.findByText("RUNNING")).toBeInTheDocument();
  });

  it("renders pipeline phases for deep scans", async () => {
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "deep", status: "completed" })
    );
    renderScanView();
    await screen.findByText("COMPLETED");
    expect(screen.getByText("Init")).toBeInTheDocument();
    expect(screen.getByText("Enumerate")).toBeInTheDocument();
    expect(screen.getByText("Scan Repos")).toBeInTheDocument();
  });

  it("hides pipeline for quick scans", async () => {
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "quick", status: "completed" })
    );
    renderScanView();
    await screen.findByText("COMPLETED");
    expect(screen.queryByText("Init")).not.toBeInTheDocument();
  });

  it("renders findings for deep scans", async () => {
    const finding = createMockFinding({ secret_type: "AWS Access Key" });
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "deep", status: "completed" })
    );
    vi.mocked(api.getFindings).mockResolvedValue({ findings: [finding], total: 1 });
    renderScanView();
    expect(await screen.findByText("AWS Access Key")).toBeInTheDocument();
  });

  it("renders search hits for quick scans", async () => {
    const hit = createMockHit({ matched_pattern: "GITHUB_TOKEN" });
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "quick", status: "completed" })
    );
    vi.mocked(api.getHits).mockResolvedValue({ hits: [hit], total: 1 });
    renderScanView();
    expect(await screen.findByText("GITHUB_TOKEN")).toBeInTheDocument();
  });

  it("shows completion banner when scan completed with no findings", async () => {
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "deep", status: "completed" })
    );
    vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
    renderScanView();
    expect(
      await screen.findByText(/scan complete — no secrets detected/i)
    ).toBeInTheDocument();
  });

  it("shows failed banner when scan failed", async () => {
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "deep", status: "failed" })
    );
    renderScanView();
    expect(
      await screen.findByText(/scan failed — see worker log for details/i)
    ).toBeInTheDocument();
  });

  it("displays severity breakdown pills when findings exist", async () => {
    const findings = [
      createMockFinding({ severity: "critical" }),
      createMockFinding({ id: "f-2", severity: "high" }),
    ];
    vi.mocked(api.getScan).mockResolvedValue(
      createMockScan({ scan_type: "deep", status: "completed" })
    );
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });
    renderScanView();
    expect(await screen.findByText(/1 CRIT/)).toBeInTheDocument();
    expect(screen.getByText(/1 HIGH/)).toBeInTheDocument();
  });
});
