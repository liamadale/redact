import { api } from "../api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockOkJson(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(""),
  });
}

function mockOkBlob(blob: Blob) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    blob: () => Promise.resolve(blob),
  });
}

function mockHttpError(status: number, text = "Not Found") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api client", () => {
  it("listScans calls GET /api/scans", async () => {
    mockOkJson({ scans: [] });
    await api.listScans();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/scans",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } })
    );
  });

  it("createScan sends POST with body and Content-Type", async () => {
    mockOkJson({ id: "scan-1" });
    const body = { target_type: "org", target_name: "test-org", scan_type: "deep" as const };
    await api.createScan(body);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/scans",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("getScan calls GET /api/scans/:id", async () => {
    mockOkJson({ id: "scan-42" });
    await api.getScan("scan-42");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/scans/scan-42",
      expect.anything()
    );
  });

  it("getFindings passes offset and limit as query params", async () => {
    mockOkJson({ findings: [], total: 0 });
    await api.getFindings("scan-1", 10, 25);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/scans/scan-1/findings?offset=10&limit=25",
      expect.anything()
    );
  });

  it("getHits passes offset and limit as query params", async () => {
    mockOkJson({ hits: [], total: 0 });
    await api.getHits("scan-1", 5, 20);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/scans/scan-1/hits?offset=5&limit=20",
      expect.anything()
    );
  });

  it("getFinding calls correct nested URL", async () => {
    mockOkJson({ id: "finding-7", compliance_controls: [] });
    await api.getFinding("scan-1", "finding-7");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/scans/scan-1/findings/finding-7",
      expect.anything()
    );
  });

  it("downloadReport builds query params from filters", async () => {
    mockOkBlob(new Blob(["{}"], { type: "application/json" }));
    await api.downloadReport("scan-1", "pdf", {
      severity: ["critical", "high"],
      repo: ["org/repo-a"],
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("format=pdf");
    expect(url).toContain("severity=critical");
    expect(url).toContain("severity=high");
    expect(url).toContain("repo=org%2Frepo-a");
  });

  it("request throws on non-ok response with status and body", async () => {
    mockHttpError(404, "scan not found");
    await expect(api.getScan("missing")).rejects.toThrow("The requested resource was not found");
  });

  it("request throws on 500 response", async () => {
    mockHttpError(500, "internal server error");
    await expect(api.listScans()).rejects.toThrow("Server error — please try again");
  });

  it("request includes Content-Type header", async () => {
    mockOkJson({ scans: [] });
    await api.listScans();
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("getMetrics calls GET /api/metrics", async () => {
    mockOkJson({ total_scans: 0, total_repos_scanned: 0, total_findings: 0, avg_time_to_detect_seconds: null });
    await api.getMetrics();
    expect(mockFetch).toHaveBeenCalledWith("/api/metrics", expect.anything());
  });
});
