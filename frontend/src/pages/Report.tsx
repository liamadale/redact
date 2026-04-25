import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Finding } from "../lib/types";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
type Severity = (typeof SEVERITIES)[number];

const SEV_STYLE: Record<Severity, string> = {
  critical: "border-tokyo-red text-tokyo-red bg-tokyo-red/10",
  high: "border-tokyo-orange text-tokyo-orange bg-tokyo-orange/10",
  medium: "border-tokyo-yellow text-tokyo-yellow bg-tokyo-yellow/10",
  low: "border-tokyo-comment text-tokyo-comment bg-white/5",
};

const SEV_STYLE_OFF = "border-tokyo-border text-tokyo-comment hover:border-tokyo-comment";

function applyFilters(
  findings: Finding[],
  severity: Set<Severity>,
  repos: Set<string>,
): Finding[] {
  return findings.filter(
    (f) =>
      (severity.size === 0 || severity.has(f.severity)) &&
      (repos.size === 0 || repos.has(f.repo_name)),
  );
}

export function Report() {
  const { scanId } = useParams<{ scanId: string }>();
  const [downloading, setDownloading] = useState<"pdf" | "json" | null>(null);
  const [selSeverity, setSelSeverity] = useState<Set<Severity>>(new Set());
  const [selRepos, setSelRepos] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);

  const { data: scan } = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", scanId, "report"],
    queryFn: () => api.getFindings(scanId!, 0, 200),
    enabled: !!scanId,
  });

  const allFindings = findings?.findings ?? [];
  const repos = useMemo(
    () => [...new Set(allFindings.map((f) => f.repo_name))].sort(),
    [allFindings],
  );
  const filtered = useMemo(
    () => applyFilters(allFindings, selSeverity, selRepos),
    [allFindings, selSeverity, selRepos],
  );
  const hasFilters = selSeverity.size > 0 || selRepos.size > 0;

  const toggleSeverity = (s: Severity) =>
    setSelSeverity((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleRepo = (r: string) =>
    setSelRepos((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });

  const handleDownload = async (format: "pdf" | "json") => {
    if (!scanId) return;
    setDownloading(format);
    try {
      const filters = {
        severity: selSeverity.size > 0 ? [...selSeverity] : undefined,
        repo: selRepos.size > 0 ? [...selRepos] : undefined,
      };
      const blob = await api.downloadReport(scanId, format, filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `redact-report-${scan?.target_name ?? scanId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const sevCounts = Object.fromEntries(
    SEVERITIES.map((s) => [s, allFindings.filter((f) => f.severity === s).length]),
  ) as Record<Severity, number>;

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link
        to={`/scans/${scanId}`}
        className="text-tokyo-comment hover:text-tokyo-fg text-sm mb-6 inline-block"
      >
        ← Back to scan
      </Link>

      <h1 className="text-2xl font-bold text-tokyo-fg mb-2">Generate Report</h1>
      {scan && (
        <p className="text-tokyo-comment text-sm mb-8">
          {scan.target_name} · {scan.scan_type} scan ·{" "}
          {scan.completed_at
            ? new Date(scan.completed_at).toLocaleDateString()
            : scan.status}
        </p>
      )}

      {/* Severity filter */}
      <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-5 mb-4">
        <h2 className="text-xs font-mono font-bold text-tokyo-comment uppercase tracking-widest mb-3">
          Filter by Severity
        </h2>
        <div className="flex gap-2 flex-wrap">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSeverity(s)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                selSeverity.has(s) ? SEV_STYLE[s] : SEV_STYLE_OFF
              }`}
            >
              {s.toUpperCase()} ({sevCounts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Repo filter */}
      {repos.length > 1 && (
        <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-5 mb-4">
          <h2 className="text-xs font-mono font-bold text-tokyo-comment uppercase tracking-widest mb-3">
            Filter by Repository
          </h2>
          <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto">
            {repos.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRepo(r)}
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                  selRepos.has(r)
                    ? "border-tokyo-cyan text-tokyo-cyan bg-tokyo-cyan/10"
                    : SEV_STYLE_OFF
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono font-bold text-tokyo-comment uppercase tracking-widest">
            Report Contents
          </h2>
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSelSeverity(new Set()); setSelRepos(new Set()); }}
              className="text-[10px] font-mono text-tokyo-comment hover:text-tokyo-fg"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="text-sm space-y-1">
          <p className="text-tokyo-fg">
            <span className="font-bold">{filtered.length}</span>
            <span className="text-tokyo-comment">
              {" "}of {allFindings.length} findings
              {hasFilters && " (filtered)"}
            </span>
          </p>
          <ul className="list-disc list-inside text-tokyo-comment space-y-0.5 ml-2 text-xs">
            <li>Executive summary with severity breakdown</li>
            <li>NIST 800-53 and DISA STIG compliance mapping</li>
            <li>Finding details with location and commit metadata</li>
            <li>Remediation roadmap</li>
          </ul>
        </div>
      </div>

      {/* Preview toggle + panel */}
      {filtered.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs font-mono text-tokyo-blue hover:text-tokyo-cyan transition-colors mb-3"
          >
            {showPreview ? "▾ Hide preview" : "▸ Preview findings"}
          </button>

          {showPreview && (
            <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              {/* Severity summary bar */}
              <div className="flex gap-3 px-4 py-2.5 border-b border-tokyo-border bg-tokyo-bg/50 text-[10px] font-mono">
                {SEVERITIES.map((s) => {
                  const c = filtered.filter((f) => f.severity === s).length;
                  if (c === 0) return null;
                  return (
                    <span key={s} className={SEV_STYLE[s].split(" ").filter((x) => x.startsWith("text-"))[0]}>
                      {c} {s.toUpperCase()}
                    </span>
                  );
                })}
                <span className="text-tokyo-comment ml-auto">
                  {[...new Set(filtered.map((f) => f.repo_name))].length} repos
                </span>
              </div>

              {/* Findings list */}
              <div className="divide-y divide-tokyo-border/50">
                {filtered.map((f) => (
                  <div key={f.id} className="flex items-start gap-2 px-4 py-2 text-[11px]">
                    <span
                      className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] ${
                        SEV_STYLE[f.severity]
                      }`}
                    >
                      {f.severity === "critical" ? "CRIT" : f.severity === "medium" ? "MED" : f.severity.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-tokyo-fg font-medium">{f.secret_type}</span>
                      {f.verified && (
                        <span className="ml-1.5 text-[9px] text-tokyo-red font-bold">LIVE</span>
                      )}
                      <p className="text-tokyo-comment text-[10px] font-mono truncate">
                        {f.repo_name} · {f.file_path}
                        {f.commit_sha && <span className="text-tokyo-border"> #{f.commit_sha.slice(0, 7)}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Download buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleDownload("pdf")}
          disabled={downloading !== null || !findings || filtered.length === 0}
          className="flex-1 py-2.5 bg-tokyo-blue text-tokyo-bg rounded font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading === "pdf" ? "Generating PDF…" : "Download PDF"}
        </button>
        <button
          onClick={() => handleDownload("json")}
          disabled={downloading !== null || !findings || filtered.length === 0}
          className="flex-1 py-2.5 bg-tokyo-bg-highlight border border-tokyo-border text-tokyo-fg rounded font-medium text-sm hover:border-tokyo-blue disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading === "json" ? "Preparing…" : "Download JSON"}
        </button>
      </div>

      {scan?.scan_type === "quick" && (
        <p className="text-tokyo-comment text-xs mt-4">
          PDF reports are most useful for deep scans with full findings. This quick scan contains
          only search hits without compliance mapping.
        </p>
      )}
    </div>
  );
}
