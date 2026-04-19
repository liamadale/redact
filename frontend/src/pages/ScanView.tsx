import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSSE } from "../hooks/useSSE";
import type { Scan } from "../lib/types";

function ProgressBar({ scan }: { scan: Scan }) {
  if (scan.status === "queued") {
    return <div className="h-2 bg-tokyo-blue/30 rounded animate-pulse" />;
  }
  if (scan.repos_total === 0) {
    return <div className="h-2 bg-tokyo-blue/30 rounded animate-pulse" />;
  }
  const pct = Math.round((scan.repos_scanned / scan.repos_total) * 100);
  return (
    <div className="h-2 bg-tokyo-bg-highlight rounded overflow-hidden">
      <div
        className="h-full bg-tokyo-blue transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: Scan["status"] }) {
  const colors = {
    queued: "bg-tokyo-comment",
    running: "bg-tokyo-blue",
    completed: "bg-tokyo-green",
    partial: "bg-tokyo-yellow",
    failed: "bg-tokyo-red",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs text-tokyo-bg font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors = {
    critical: "bg-tokyo-red",
    high: "bg-tokyo-orange",
    medium: "bg-tokyo-yellow",
    low: "bg-tokyo-comment",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs text-tokyo-bg font-medium ${colors[severity as keyof typeof colors] || "bg-tokyo-comment"}`}
    >
      {severity}
    </span>
  );
}

export function ScanView() {
  const { id } = useParams<{ id: string }>();
  useSSE(id ?? null);

  const { data: scan } = useQuery({
    queryKey: ["scan", id],
    queryFn: () => api.getScan(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (s && (s.status === "completed" || s.status === "failed" || s.status === "partial")) return false;
      return 5000;
    },
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", id],
    queryFn: () => api.getFindings(id!),
    enabled: !!id && scan?.scan_type === "deep",
  });

  const { data: hits } = useQuery({
    queryKey: ["hits", id],
    queryFn: () => api.getHits(id!),
    enabled: !!id && scan?.scan_type === "quick",
  });

  if (!scan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-tokyo-comment">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-tokyo-fg">
            {scan.target_name}
          </h1>
          <StatusBadge status={scan.status} />
        </div>
        <p className="text-tokyo-comment text-sm">
          {scan.scan_type} scan · {scan.platform}
        </p>
      </div>

      {(scan.status === "running" || scan.status === "queued") && (
        <div className="mb-6 space-y-2">
          <ProgressBar scan={scan} />
          {scan.current_repo && (
            <p className="text-tokyo-comment text-sm">
              Scanning: {scan.current_repo} ({scan.repos_scanned}/
              {scan.repos_total})
            </p>
          )}
        </div>
      )}

      {/* Deep scan findings */}
      {scan.scan_type === "deep" && findings && findings.total > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-tokyo-fg">
            Findings ({findings.total})
          </h2>
          {findings.findings.map((f) => (
            <div
              key={f.id}
              className="p-4 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg"
            >
              <div className="flex items-center gap-2 mb-1">
                <SeverityBadge severity={f.severity} />
                <span className="text-tokyo-fg font-medium">
                  {f.secret_type}
                </span>
                {f.verified && (
                  <span className="text-tokyo-red text-xs">● verified</span>
                )}
              </div>
              <p className="text-tokyo-comment text-sm">
                {f.repo_name} · {f.file_path}
                {f.line_number ? `:${f.line_number}` : ""}
              </p>
              <p className="text-tokyo-fg font-mono text-sm mt-1">
                {f.redacted_secret}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Quick scan hits */}
      {scan.scan_type === "quick" && hits && hits.total > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-tokyo-fg">
            Search Hits ({hits.total})
          </h2>
          {hits.hits.map((h, i) => (
            <div
              key={i}
              className="p-4 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-xs bg-tokyo-blue text-tokyo-bg font-medium">
                  {h.matched_pattern}
                </span>
                <span className="text-tokyo-fg font-medium">{h.repo_name}</span>
              </div>
              <p className="text-tokyo-comment text-sm">{h.file_path}</p>
              {h.text_fragment && (
                <pre className="text-tokyo-fg font-mono text-xs mt-2 overflow-x-auto">
                  {h.text_fragment}
                </pre>
              )}
              <a
                href={h.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-tokyo-blue text-xs hover:underline mt-1 inline-block"
              >
                View on GitHub →
              </a>
            </div>
          ))}
        </div>
      )}

      {scan.status === "completed" &&
        findings?.total === 0 &&
        hits?.total === 0 && (
          <p className="text-tokyo-green text-center mt-8">
            ✓ No secrets found
          </p>
        )}
    </div>
  );
}
