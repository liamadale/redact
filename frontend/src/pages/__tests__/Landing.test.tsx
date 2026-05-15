import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Landing } from "../Landing";
import { api } from "../../lib/api";
import { createMockScan } from "../../test/helpers";
import type { ScanSummary } from "../../lib/types";

vi.mock("../../lib/api", () => ({
  api: {
    listScans: vi.fn(),
    createScan: vi.fn(),
  },
}));

function makeScanSummary(overrides?: Partial<ScanSummary>): ScanSummary {
  return {
    id: "scan-1",
    platform: "github",
    target_type: "org",
    target_name: "test-org",
    scan_type: "deep",
    status: "completed",
    repos_total: 5,
    repos_scanned: 5,
    created_at: "2024-01-01T00:00:00Z",
    completed_at: "2024-01-01T01:00:00Z",
    findings_total: 3,
    findings_critical: 1,
    findings_high: 2,
    ...overrides,
  };
}

function renderLanding() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.listScans).mockResolvedValue({ scans: [] });
  vi.mocked(api.createScan).mockReset();
});

describe("Landing", () => {
  it("renders scan form with target input and submit button", () => {
    renderLanding();
    expect(
      screen.getByPlaceholderText(/github-org or username/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
  });

  it("submit button is disabled when target is empty", () => {
    renderLanding();
    expect(screen.getByRole("button", { name: /run/i })).toBeDisabled();
  });

  it("shows validation error for bad repo format (no slash)", async () => {
    const user = userEvent.setup();
    renderLanding();

    // Switch to "Repo" mode
    await user.click(screen.getByRole("button", { name: /^Repo$/i }));
    await user.type(screen.getByPlaceholderText(/owner\/repo/i), "noslash");
    await user.click(screen.getByRole("button", { name: /run/i }));

    expect(
      await screen.findByText(/Repo must be in owner\/repo format/i)
    ).toBeInTheDocument();
  });

  it("shows validation error for org with slash", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.type(
      screen.getByPlaceholderText(/github-org or username/i),
      "org/with/slash"
    );
    await user.click(screen.getByRole("button", { name: /run/i }));

    expect(
      await screen.findByText(/Org\/user must not contain a slash/i)
    ).toBeInTheDocument();
  });

  it("creates scan on valid submit and calls createScan with correct body", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createScan).mockResolvedValue(createMockScan());
    renderLanding();

    await user.type(
      screen.getByPlaceholderText(/github-org or username/i),
      "test-org"
    );
    await user.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() => {
      expect(vi.mocked(api.createScan)).toHaveBeenCalledWith(
        expect.objectContaining({
          target_type: "org",
          target_name: "test-org",
          scan_type: "quick",
        })
      );
    });
  });

  it("displays previous scans from API", async () => {
    vi.mocked(api.listScans).mockResolvedValue({
      scans: [
        makeScanSummary({ id: "s1", target_name: "my-org" }),
        makeScanSummary({ id: "s2", target_name: "another-org" }),
      ],
    });
    renderLanding();

    expect(await screen.findByText("my-org")).toBeInTheDocument();
    expect(await screen.findByText("another-org")).toBeInTheDocument();
  });

  it("hides scan history section when no previous scans", async () => {
    vi.mocked(api.listScans).mockResolvedValue({ scans: [] });
    renderLanding();

    // Wait for the query to settle, then check history section is absent
    await waitFor(() => {
      expect(screen.queryByText(/Previous Scans/i)).not.toBeInTheDocument();
    });
  });

  it("shows error message on failed scan creation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createScan).mockRejectedValue(new Error("500: server error"));
    renderLanding();

    await user.type(
      screen.getByPlaceholderText(/github-org or username/i),
      "test-org"
    );
    await user.click(screen.getByRole("button", { name: /run/i }));

    expect(await screen.findByText(/500: server error/i)).toBeInTheDocument();
  });

  it("shows Queuing... while mutation is pending", async () => {
    const user = userEvent.setup();
    // Never resolves
    vi.mocked(api.createScan).mockImplementation(() => new Promise(() => {}));
    renderLanding();

    await user.type(
      screen.getByPlaceholderText(/github-org or username/i),
      "test-org"
    );
    await user.click(screen.getByRole("button", { name: /run/i }));

    expect(await screen.findByText("Queuing...")).toBeInTheDocument();
  });
});
