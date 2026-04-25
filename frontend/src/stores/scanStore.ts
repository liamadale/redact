import { create } from "zustand";

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  prefix: string;
  message: string;
}

let _logId = 0;

const MAX_LOGS = 500;

interface ScanStore {
  currentScanId: string | null;
  setCurrentScanId: (id: string | null) => void;
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  clearLogs: () => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  currentScanId: null,
  setCurrentScanId: (id) => set({ currentScanId: id }),
  logs: [],
  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs.slice(-MAX_LOGS + 1),
        { ...entry, id: ++_logId, timestamp: new Date() },
      ],
    })),
  clearLogs: () => set({ logs: [] }),
}));
