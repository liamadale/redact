import type {
  Scan,
  ScanCreate,
  FindingsResponse,
  FindingDetail,
  HitsResponse,
} from "./types";

const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export const api = {
  createScan: (body: ScanCreate) =>
    request<Scan>("/scans", { method: "POST", body: JSON.stringify(body) }),

  getScan: (id: string) => request<Scan>(`/scans/${id}`),

  getFindings: (id: string, offset = 0, limit = 50) =>
    request<FindingsResponse>(
      `/scans/${id}/findings?offset=${offset}&limit=${limit}`
    ),

  getHits: (id: string, offset = 0, limit = 50) =>
    request<HitsResponse>(`/scans/${id}/hits?offset=${offset}&limit=${limit}`),

  getFinding: (scanId: string, findingId: string) =>
    request<FindingDetail>(`/scans/${scanId}/findings/${findingId}`),

  downloadReport: async (scanId: string, format: "pdf" | "json"): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/scans/${scanId}/report?format=${format}`);
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.blob();
  },
};
