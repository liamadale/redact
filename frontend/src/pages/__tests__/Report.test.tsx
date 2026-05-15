import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Report } from "../Report";
import { api } from "../../lib/api";
import { createMockScan, createMockFinding } from "../../test/helpers";

vi.mock("../../lib/api", () => ({
  api: {
    getScan: vi.fn(),
    getFindings: vi.fn(),
    downloadReport: vi.fn(),
  },
}));

function renderReport(scanId = "scan-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/scans/${scanId}/report`]}>
        <Routes>
          <Route path="/scans/:scanId/report" element={<Report />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.getScan).mockResolvedValue(createMockScan({ scan_type: "deep", status: "completed" }));
  vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
  vi.mocked(api.downloadReport).mockResolvedValue(new Blob(["{}"], { type: "application/json" }));
  // Prevent errors from createObjectURL
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Report", () => {
  it("renders severity filter buttons with counts", async () => {
    const findings = [
      createMockFinding({ severity: "critical" }),
      createMockFinding({ id: "f-2", severity: "high" }),
      createMockFinding({ id: "f-3", severity: "high" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 3 });
    renderReport();

    expect(await screen.findByText("CRITICAL (1)")).toBeInTheDocument();
    expect(screen.getByText("HIGH (2)")).toBeInTheDocument();
    expect(screen.getByText("MEDIUM (0)")).toBeInTheDocument();
    expect(screen.getByText("LOW (0)")).toBeInTheDocument();
  });

  it("toggling severity filter button updates its active state", async () => {
    const user = userEvent.setup();
    const findings = [createMockFinding({ severity: "critical" })];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });
    renderReport();

    const critButton = await screen.findByText("CRITICAL (1)");
    await user.click(critButton);

    // After clicking, the button should have the active severity style classes
    expect(critButton).toHaveClass("text-tokyo-red");
  });

  it("renders repo filter buttons when findings span 2+ repos", async () => {
    const findings = [
      createMockFinding({ repo_name: "org/repo-a" }),
      createMockFinding({ id: "f-2", repo_name: "org/repo-b" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });
    renderReport();

    expect(await screen.findByText("org/repo-a")).toBeInTheDocument();
    expect(screen.getByText("org/repo-b")).toBeInTheDocument();
  });

  it("hides repo filter when all findings are from one repo", async () => {
    const findings = [
      createMockFinding({ repo_name: "org/repo-a" }),
      createMockFinding({ id: "f-2", repo_name: "org/repo-a" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });
    renderReport();

    // Wait for findings to load (both findings are critical so count=2)
    await screen.findByText("CRITICAL (2)");
    expect(screen.queryByText("Filter by Repository")).not.toBeInTheDocument();
  });

  it("disables download buttons when there are no findings", async () => {
    vi.mocked(api.getFindings).mockResolvedValue({ findings: [], total: 0 });
    renderReport();

    await screen.findByText("Generate Report");
    expect(screen.getByText("Download PDF")).toBeDisabled();
    expect(screen.getByText("Download JSON")).toBeDisabled();
  });

  it("PDF download button triggers downloadReport with pdf format", async () => {
    const user = userEvent.setup();
    const findings = [createMockFinding()];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });
    renderReport();

    await screen.findByText("Download PDF");
    await user.click(screen.getByText("Download PDF"));

    await waitFor(() => {
      expect(vi.mocked(api.downloadReport)).toHaveBeenCalledWith(
        "scan-1",
        "pdf",
        expect.anything()
      );
    });
  });

  it("JSON download button triggers downloadReport with json format", async () => {
    const user = userEvent.setup();
    const findings = [createMockFinding()];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });
    renderReport();

    await screen.findByText("Download JSON");
    await user.click(screen.getByText("Download JSON"));

    await waitFor(() => {
      expect(vi.mocked(api.downloadReport)).toHaveBeenCalledWith(
        "scan-1",
        "json",
        expect.anything()
      );
    });
  });

  it("preview toggle shows the findings list", async () => {
    const user = userEvent.setup();
    const findings = [createMockFinding({ secret_type: "AWS Access Key" })];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });
    renderReport();

    const previewToggle = await screen.findByText(/Preview findings/i);
    await user.click(previewToggle);

    expect(screen.getByText("AWS Access Key")).toBeInTheDocument();
  });

  it("toggling severity filter reduces the finding count in summary", async () => {
    const user = userEvent.setup();
    const findings = [
      createMockFinding({ severity: "critical" }),
      createMockFinding({ id: "f-2", severity: "high" }),
    ];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 2 });
    renderReport();

    // Initially shows "2 of 2 findings"
    expect(await screen.findByText("2")).toBeInTheDocument();

    // Toggle "critical" filter
    await user.click(screen.getByText("CRITICAL (1)"));

    // Now shows "1 of 2 findings (filtered)"
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/filtered/i)).toBeInTheDocument();
  });

  it("shows Generating PDF... text while downloading", async () => {
    const user = userEvent.setup();
    const findings = [createMockFinding()];
    vi.mocked(api.getFindings).mockResolvedValue({ findings, total: 1 });
    // Never resolve so we can see the pending state
    vi.mocked(api.downloadReport).mockImplementation(() => new Promise(() => {}));

    renderReport();
    await screen.findByText("Download PDF");
    await user.click(screen.getByText("Download PDF"));

    expect(await screen.findByText("Generating PDF…")).toBeInTheDocument();
  });
});
