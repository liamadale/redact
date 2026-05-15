import { useScanStore } from "../scanStore";

beforeEach(() => {
  useScanStore.setState({
    currentScanId: null,
    logs: [],
    connectionStatus: "disconnected",
  });
});

describe("scanStore", () => {
  it("initial state is empty", () => {
    const { currentScanId, logs, connectionStatus } = useScanStore.getState();
    expect(currentScanId).toBeNull();
    expect(logs).toHaveLength(0);
    expect(connectionStatus).toBe("disconnected");
  });

  it("setCurrentScanId updates ID", () => {
    useScanStore.getState().setCurrentScanId("scan-123");
    expect(useScanStore.getState().currentScanId).toBe("scan-123");
  });

  it("addLog appends log with auto-ID and timestamp", () => {
    useScanStore.getState().addLog({ level: "info", prefix: "TEST", message: "hello" });
    const { logs } = useScanStore.getState();
    expect(logs).toHaveLength(1);
    expect(logs[0].prefix).toBe("TEST");
    expect(logs[0].message).toBe("hello");
    expect(logs[0].level).toBe("info");
    expect(logs[0].id).toBeGreaterThan(0);
    expect(logs[0].timestamp).toBeInstanceOf(Date);
  });

  it("addLog caps at 500 entries", () => {
    const store = useScanStore.getState();
    for (let i = 0; i < 501; i++) {
      store.addLog({ level: "info", prefix: "X", message: `msg-${i}` });
    }
    expect(useScanStore.getState().logs).toHaveLength(500);
    // Oldest entry should be gone; the last one should still be present
    expect(useScanStore.getState().logs.at(-1)?.message).toBe("msg-500");
  });

  it("clearLogs resets logs and sets status to disconnected", () => {
    const store = useScanStore.getState();
    store.addLog({ level: "info", prefix: "X", message: "test" });
    store.setConnectionStatus("live");
    store.clearLogs();
    const state = useScanStore.getState();
    expect(state.logs).toHaveLength(0);
    expect(state.connectionStatus).toBe("disconnected");
  });

  it("setConnectionStatus updates to each valid status", () => {
    const { setConnectionStatus } = useScanStore.getState();
    setConnectionStatus("live");
    expect(useScanStore.getState().connectionStatus).toBe("live");
    setConnectionStatus("polling");
    expect(useScanStore.getState().connectionStatus).toBe("polling");
    setConnectionStatus("disconnected");
    expect(useScanStore.getState().connectionStatus).toBe("disconnected");
  });
});
