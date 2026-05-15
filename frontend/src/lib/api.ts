import { ApiError } from "./errors";
import type {
  Scan,
  ScanCreate,
  ScanListResponse,
  AggregateMetrics,
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
    throw new ApiError(res.status, await res.text());
  }
  return res.json();
}

export const api = {
  listScans: () => request<ScanListResponse>("/scans"),

  getMetrics: () => request<AggregateMetrics>("/metrics"),

  createScan: (body: ScanCreate) =>
    request<Scan>("/scans", { method: "POST", body: JSON.stringify(body) }),

  getScan: (id: string) => request<Scan>(`/scans/${id}`),

  deleteScan: (id: string) =>
    fetch(`${API_BASE}/scans/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) throw new ApiError(res.status, res.statusText);
    }),

  getFindings: (id: string, offset = 0, limit = 50) =>
    request<FindingsResponse>(
      `/scans/${id}/findings?offset=${offset}&limit=${limit}`
    ),

  getHits: (id: string, offset = 0, limit = 50) =>
    request<HitsResponse>(`/scans/${id}/hits?offset=${offset}&limit=${limit}`),

  getFinding: (scanId: string, findingId: string) =>
    request<FindingDetail>(`/scans/${scanId}/findings/${findingId}`),

  downloadReport: async (
    scanId: string,
    format: "pdf" | "json",
    filters?: { severity?: string[]; repo?: string[] },
  ): Promise<Blob> => {
    const params = new URLSearchParams({ format });
    if (filters?.severity) filters.severity.forEach((s) => params.append("severity", s));
    if (filters?.repo) filters.repo.forEach((r) => params.append("repo", r));
    const res = await fetch(`${API_BASE}/scans/${scanId}/report?${params}`);
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.blob();
  },

  pauseScan: (id: string) =>
    request<{ status: string }>(`/scans/${id}/pause`, { method: "POST" }),

  resumeScan: (id: string) =>
    request<{ status: string }>(`/scans/${id}/resume`, { method: "POST" }),

  cancelScan: (id: string) =>
    request<{ status: string }>(`/scans/${id}/cancel`, { method: "POST" }),
};
