import { create } from "zustand";

interface ScanStore {
  currentScanId: string | null;
  setCurrentScanId: (id: string | null) => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  currentScanId: null,
  setCurrentScanId: (id) => set({ currentScanId: id }),
}));
