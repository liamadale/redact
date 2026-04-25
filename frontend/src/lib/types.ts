export interface Scan {
  id: string;
  session_id: string;
  platform: string;
  target_type: string;
  target_name: string;
  scan_type: "quick" | "deep";
  status: "queued" | "running" | "completed" | "partial" | "failed";
  repos_total: number;
  repos_scanned: number;
  current_repo: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface Finding {
  id: string;
  scan_id: string;
  repo_name: string;
  secret_type: string;
  severity: "critical" | "high" | "medium" | "low";
  file_path: string;
  line_number: number | null;
  commit_sha: string | null;
  commit_date: string | null;
  commit_author: string | null;
  commit_message: string | null;
  branch_status: string | null;
  verified: boolean | null;
  redacted_secret: string | null;
  occurrence_count: number;
  first_seen: string | null;
  last_seen: string | null;
  created_at: string | null;
}

export interface SearchHit {
  repo_name: string;
  file_path: string;
  matched_pattern: string;
  text_fragment: string;
  html_url: string;
}

export interface ScanCreate {
  platform?: string;
  target_type: string;
  target_name: string;
  scan_type: "quick" | "deep";
  token?: string;
}

export interface ScanSummary {
  id: string;
  platform: string;
  target_type: string;
  target_name: string;
  scan_type: "quick" | "deep";
  status: "queued" | "running" | "completed" | "partial" | "failed";
  repos_total: number;
  repos_scanned: number;
  created_at: string | null;
  completed_at: string | null;
  findings_total: number;
  findings_critical: number;
  findings_high: number;
}

export interface ScanListResponse {
  scans: ScanSummary[];
}

export interface AggregateMetrics {
  total_scans: number;
  total_repos_scanned: number;
  total_findings: number;
  avg_time_to_detect_seconds: number | null;
}

export interface FindingsResponse {
  findings: Finding[];
  total: number;
}

export interface HitsResponse {
  hits: SearchHit[];
  total: number;
}

export interface ComplianceControl {
  framework: string;
  control_id: string;
  control_title: string;
  description: string | null;
}

export interface FindingDetail extends Finding {
  compliance_controls: ComplianceControl[];
}
