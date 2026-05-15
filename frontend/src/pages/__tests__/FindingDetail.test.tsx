import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FindingDetail } from "../FindingDetail";
import { api } from "../../lib/api";
import { createMockFinding } from "../../test/helpers";
import type { FindingDetail as FindingDetailType } from "../../lib/types";

vi.mock("../../lib/api", () => ({
  api: { getFinding: vi.fn() },
}));

function makeFindingDetail(overrides?: Partial<FindingDetailType>): FindingDetailType {
  return {
    ...createMockFinding(),
    compliance_controls: [],
    ...overrides,
  };
}

function renderFindingDetail(scanId = "scan-1", findingId = "finding-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`/scans/${scanId}/findings/${findingId}`]}
      >
        <Routes>
          <Route
            path="/scans/:scanId/findings/:findingId"
            element={<FindingDetail />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.getFinding).mockReset();
});

describe("FindingDetail", () => {
  it("shows loading state before data arrives", () => {
    vi.mocked(api.getFinding).mockImplementation(() => new Promise(() => {}));
    renderFindingDetail();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error state with back link when finding not found", async () => {
    vi.mocked(api.getFinding).mockRejectedValue(new Error("404: not found"));
    renderFindingDetail();
    expect(await screen.findByText("Finding not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to scan/i })).toBeInTheDocument();
  });

  it("renders severity badge with correct class for critical", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ severity: "critical" })
    );
    renderFindingDetail();
    const badge = await screen.findByText("critical");
    expect(badge).toHaveClass("bg-tokyo-red");
  });

  it("renders severity badge for high severity", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ severity: "high" })
    );
    renderFindingDetail();
    const badge = await screen.findByText("high");
    expect(badge).toHaveClass("bg-tokyo-orange");
  });

  it("renders redacted secret in a code element", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ redacted_secret: "AKIA████████" })
    );
    renderFindingDetail();
    expect(await screen.findByText("AKIA████████")).toBeInTheDocument();
    expect(screen.getByText("AKIA████████").tagName).toBe("CODE");
  });

  it("hides secret section when redacted_secret is null", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ redacted_secret: null })
    );
    renderFindingDetail();
    await screen.findByText("AWS Access Key"); // wait for load
    expect(screen.queryByText("Secret (redacted)")).not.toBeInTheDocument();
  });

  it("renders compliance controls grouped by framework", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({
        compliance_controls: [
          {
            framework: "NIST_800_53",
            control_id: "IA-5",
            control_title: "Authenticator Management",
            description: null,
          },
          {
            framework: "DISA_STIG",
            control_id: "V-222400",
            control_title: "Secret Storage",
            description: null,
          },
        ],
      })
    );
    renderFindingDetail();
    expect(await screen.findByText("NIST 800-53")).toBeInTheDocument();
    expect(screen.getByText("DISA STIG")).toBeInTheDocument();
    expect(screen.getByText("IA-5")).toBeInTheDocument();
    expect(screen.getByText("V-222400")).toBeInTheDocument();
  });

  it("hides compliance section when controls are empty", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ compliance_controls: [] })
    );
    renderFindingDetail();
    await screen.findByText("AWS Access Key");
    expect(screen.queryByText("Compliance Impact")).not.toBeInTheDocument();
  });

  it("shows 'verified active' badge in header for verified findings", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ verified: true })
    );
    renderFindingDetail();
    // The header badge contains "● verified active"
    const badges = await screen.findAllByText(/verified active/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders remediation steps", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(makeFindingDetail());
    renderFindingDetail();
    expect(await screen.findByText("Remediation")).toBeInTheDocument();
    expect(screen.getByText(/Rotate the credential/i)).toBeInTheDocument();
  });

  it("renders file path and line number", async () => {
    vi.mocked(api.getFinding).mockResolvedValue(
      makeFindingDetail({ file_path: "src/config.ts", line_number: 42 })
    );
    renderFindingDetail();
    expect(await screen.findByText("src/config.ts:42")).toBeInTheDocument();
  });
});
