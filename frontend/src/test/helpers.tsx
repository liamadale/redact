import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type {
  Scan,
  Finding,
  SearchHit,
  AggregateMetrics,
} from "../lib/types";

export function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

export function createMockScan(overrides?: Partial<Scan>): Scan {
  return {
    id: "scan-1",
    session_id: "session-1",
    platform: "github",
    target_type: "org",
    target_name: "test-org",
    scan_type: "deep",
    status: "completed",
    repos_total: 5,
    repos_scanned: 5,
    current_repo: null,
    started_at: "2024-01-01T00:00:00Z",
    completed_at: "2024-01-01T01:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function createMockFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: "finding-1",
    scan_id: "scan-1",
    repo_name: "test-org/repo-1",
    secret_type: "AWS Access Key",
    severity: "critical",
    file_path: "src/config.ts",
    line_number: 42,
    commit_sha: "abc123",
    commit_date: "2024-01-01T00:00:00Z",
    commit_author: "dev@example.com",
    commit_message: "add config",
    branch_status: "active",
    verified: true,
    redacted_secret: "AKIA████████",
    occurrence_count: 1,
    first_seen: "2024-01-01T00:00:00Z",
    last_seen: "2024-01-01T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function createMockHit(overrides?: Partial<SearchHit>): SearchHit {
  return {
    repo_name: "test-org/repo-1",
    file_path: "src/config.ts",
    matched_pattern: "AWS_SECRET",
    text_fragment: "AWS_SECRET=████████",
    html_url: "https://github.com/test-org/repo-1/blob/main/src/config.ts",
    ...overrides,
  };
}

export function createMockMetrics(
  overrides?: Partial<AggregateMetrics>
): AggregateMetrics {
  return {
    total_scans: 10,
    total_repos_scanned: 50,
    total_findings: 25,
    avg_time_to_detect_seconds: 3600,
    ...overrides,
  };
}
