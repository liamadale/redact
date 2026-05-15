import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useScanStore } from "../../stores/scanStore";
import { useSSE } from "../useSSE";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: { getScan: vi.fn() },
}));

// Mock EventSource
class MockEventSource {
  static instance: MockEventSource | null = null;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instance = this;
  }
}

vi.stubGlobal("EventSource", MockEventSource);

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  MockEventSource.instance = null;
  vi.mocked(api.getScan).mockReset();
  useScanStore.setState({ logs: [], connectionStatus: "disconnected", currentScanId: null });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useSSE", () => {
  it("does not connect when scanId is null", () => {
    const queryClient = makeQueryClient();
    renderHook(() => useSSE(null), { wrapper: makeWrapper(queryClient) });
    expect(MockEventSource.instance).toBeNull();
  });

  it("opens EventSource to correct URL", () => {
    const queryClient = makeQueryClient();
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    expect(MockEventSource.instance).not.toBeNull();
    expect(MockEventSource.instance!.url).toBe("/api/scans/scan-1/stream");
  });

  it("sets connection status to live on open", () => {
    const queryClient = makeQueryClient();
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onopen!();
    });
    expect(useScanStore.getState().connectionStatus).toBe("live");
  });

  it("parses repo_started event and adds CLONE log", () => {
    const queryClient = makeQueryClient();
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onmessage!({
        data: JSON.stringify({ event: "repo_started", repo: "org/repo-a" }),
      } as MessageEvent);
    });
    const logs = useScanStore.getState().logs;
    expect(logs.some((l) => l.prefix === "CLONE")).toBe(true);
    expect(logs.some((l) => l.prefix === "SCAN")).toBe(true);
  });

  it("parses finding event and adds FIND log", () => {
    const queryClient = makeQueryClient();
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onmessage!({
        data: JSON.stringify({ event: "finding", type: "AWS Key", repo: "org/repo" }),
      } as MessageEvent);
    });
    const logs = useScanStore.getState().logs;
    expect(logs.some((l) => l.prefix === "FIND")).toBe(true);
  });

  it("parses complete event and sets status to disconnected", () => {
    const queryClient = makeQueryClient();
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onmessage!({
        data: JSON.stringify({ event: "complete", scan_type: "deep" }),
      } as MessageEvent);
    });
    expect(useScanStore.getState().connectionStatus).toBe("disconnected");
  });

  it("parses complete event and invalidates query cache", () => {
    const queryClient = makeQueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onmessage!({
        data: JSON.stringify({ event: "complete" }),
      } as MessageEvent);
    });
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to polling on EventSource error", () => {
    const queryClient = makeQueryClient();
    vi.mocked(api.getScan).mockResolvedValue({
      id: "scan-1",
      status: "running",
    } as never);
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onerror!();
    });
    expect(useScanStore.getState().connectionStatus).toBe("polling");
    expect(MockEventSource.instance!.close).toHaveBeenCalled();
  });

  it("polling calls api.getScan after interval", async () => {
    const queryClient = makeQueryClient();
    vi.mocked(api.getScan).mockResolvedValue({
      id: "scan-1",
      status: "running",
    } as never);
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onerror!();
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(api.getScan)).toHaveBeenCalledWith("scan-1");
  });

  it("stops polling after max consecutive failures", async () => {
    const queryClient = makeQueryClient();
    vi.mocked(api.getScan).mockRejectedValue(new Error("Network error"));
    renderHook(() => useSSE("scan-1"), { wrapper: makeWrapper(queryClient) });
    act(() => {
      MockEventSource.instance!.onerror!();
    });
    // Advance through 5 polling cycles
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    expect(useScanStore.getState().connectionStatus).toBe("disconnected");
  });

  it("cleans up EventSource on unmount", () => {
    const queryClient = makeQueryClient();
    const { unmount } = renderHook(() => useSSE("scan-1"), {
      wrapper: makeWrapper(queryClient),
    });
    const es = MockEventSource.instance!;
    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
