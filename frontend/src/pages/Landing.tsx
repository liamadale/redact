import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useScanStore } from "../stores/scanStore";
import type { ScanCreate, ScanSummary } from "../lib/types";

const SCAN_TYPE_INFO = {
  quick: { label: "Quick Scan", badge: "Search API", color: "tokyo-blue" },
  deep: { label: "Deep Scan", badge: "Full History", color: "tokyo-magenta" },
} as const;

const STATUS_STYLE: Record<string, string> = {
  completed: "text-tokyo-green bg-tokyo-green/10",
  running: "text-tokyo-yellow bg-tokyo-yellow/10",
  queued: "text-tokyo-blue bg-tokyo-blue/10",
  partial: "text-tokyo-yellow bg-tokyo-yellow/10",
  failed: "text-tokyo-red bg-tokyo-red/10",
};

function ScanCard({ scan }: { scan: ScanSummary }) {
  const date = scan.completed_at ?? scan.created_at;
  return (
    <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4 hover:border-tokyo-comment/50 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={`/scans/${scan.id}`}
              className="text-tokyo-fg font-bold text-sm truncate hover:text-tokyo-blue transition-colors"
            >
              {scan.target_name}
            </Link>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
              scan.scan_type === "deep" ? "text-tokyo-magenta bg-tokyo-magenta/10" : "text-tokyo-blue bg-tokyo-blue/10"
            }`}>
              {scan.scan_type.toUpperCase()}
            </span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${STATUS_STYLE[scan.status] ?? STATUS_STYLE.failed}`}>
              {scan.status.toUpperCase()}
            </span>
          </div>
          <p className="text-tokyo-comment text-xs font-mono">
            {date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
            <span className="text-tokyo-border mx-1.5">·</span>
            {scan.repos_scanned}/{scan.repos_total} repos
          </p>
        </div>
      </div>

      {/* Severity pills */}
      {scan.findings_total > 0 && (
        <div className="flex gap-1.5 mb-3">
          {scan.findings_critical > 0 && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-tokyo-red/15 text-tokyo-red">
              {scan.findings_critical} CRIT
            </span>
          )}
          {scan.findings_high > 0 && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-tokyo-orange/15 text-tokyo-orange">
              {scan.findings_high} HIGH
            </span>
          )}
          {scan.findings_total - scan.findings_critical - scan.findings_high > 0 && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-tokyo-yellow/15 text-tokyo-yellow">
              {scan.findings_total - scan.findings_critical - scan.findings_high} MED/LOW
            </span>
          )}
          <span className="text-[9px] font-mono text-tokyo-comment ml-auto">
            {scan.findings_total} total
          </span>
        </div>
      )}
      {scan.findings_total === 0 && scan.status === "completed" && (
        <p className="text-[10px] font-mono text-tokyo-green mb-3">✓ no findings</p>
      )}

      {/* Action links */}
      <div className="flex gap-2 text-[10px] font-mono">
        <Link to={`/scans/${scan.id}`} className="text-tokyo-comment hover:text-tokyo-fg transition-colors">
          View
        </Link>
        {scan.scan_type === "deep" && scan.status !== "queued" && (
          <>
            <span className="text-tokyo-border">·</span>
            <Link to={`/dashboard/${scan.id}`} className="text-tokyo-comment hover:text-tokyo-fg transition-colors">
              Dashboard
            </Link>
            <span className="text-tokyo-border">·</span>
            <Link to={`/metrics/${scan.id}`} className="text-tokyo-comment hover:text-tokyo-fg transition-colors">
              Metrics
            </Link>
            <span className="text-tokyo-border">·</span>
            <Link to={`/scans/${scan.id}/report`} className="text-tokyo-comment hover:text-tokyo-fg transition-colors">
              Report
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const setCurrentScanId = useScanStore((s) => s.setCurrentScanId);
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<"quick" | "deep">("quick");
  const [targetType, setTargetType] = useState<"org" | "repo">("org");
  
  // Uncomment when platform selection is implemented
  // const [platform, setPlatform] = useState<"GitHub" | "GitLab" | "BitBucket">("GitHub");

  const { data: scanList } = useQuery({
    queryKey: ["scans"],
    queryFn: () => api.listScans(),
  });

  const mutation = useMutation({
    mutationFn: (body: ScanCreate) => api.createScan(body),
    onSuccess: (scan) => {
      setCurrentScanId(scan.id);
      navigate(`/scans/${scan.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    mutation.mutate({ target_type: targetType, target_name: target.trim(), scan_type: scanType });
  };

  const handlePlatformChange = (_platform: "GitHub" | "GitLab" | "BitBucket") => {
    // Uncomment when platform selection is implemented
    // setPlatform(p);
  };

  const info = SCAN_TYPE_INFO[scanType];
  const scans = scanList?.scans ?? [];

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Wordmark */}
        <div className="mb-4 text-center">
          <h1 className="text-4xl font-black tracking-tight text-tokyo-fg mb-1">REDACT</h1>
          <p className="text-tokyo-comment text-xs tracking-widest uppercase">Git Secrets Auditor</p>
          <p
            id="compliance-banner"
            className="mt-4 inline-flex items-center gap-2.5 bg-tokyo-bg-dark border border-l-[3px] border-tokyo-red/30 border-l-tokyo-red rounded-md px-3.5 py-2"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-tokyo-red" />
              <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-tokyo-red" />
              <circle cx="8" cy="12" r="0.75" fill="currentColor" className="text-tokyo-red" />
            </svg>
            <span className="font-mono text-[11px] tracking-widest uppercase text-tokyo-red">
              This tool is for authorized security auditing only.
            </span>
          </p>
        </div>

        {/* New scan form */}
        <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-xl p-6 mb-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">

                  {/* Platform toggle 
                    *
                    * Not implemented yet, platform selection is currently GitHub only
                    * When implemented, make the following updates:
                    *   1. Uncomment: `const [platform, setPlatform] = ...`
                    *   2. Uncomment: `setPlatform(p);` in handlePlatformChange()
                    *   3. Add `platform` to `scan_type: scanType`
                    *      Example: `scan_type: scanType, platform`
                    */}
                  {(["github", "gitlab", "bitbucket"] as const).map((p) => {
                    const enabled: Record<string, boolean> = {
                      github: true,
                      gitlab: false,
                      bitbucket: false,
                    };
                    const labels: Record<string, string> = {
                      github: "GitHub",
                      gitlab: "GitLab",
                      bitbucket: "Bitbucket",
                    };
                    const isEnabled = enabled[p];

                    return (
                      <div key={p} className="relative">
                        <button
                          type="button"
                          disabled={!isEnabled}
                          onClick={() => handlePlatformChange(labels[p] as "GitHub" | "GitLab" | "BitBucket")}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                            isEnabled
                              ? "bg-tokyo-cyan/20 border-tokyo-cyan text-tokyo-cyan"
                              : "border-tokyo-border/40 text-tokyo-comment/30 cursor-not-allowed"
                          }`}
                        >
                          {labels[p]}
                        </button>
                        {!isEnabled && (
                          <span className="absolute -top-2 -right-1 text-[9px] font-semibold bg-tokyo-bg-highlight text-tokyo-blue/40 rounded px-1 leading-4">
                            soon
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Divider */}
                  <div className="h-4 w-px bg-tokyo-border mx-1" />

                  {/* Scope toggle */}
                  {(["org", "repo"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTargetType(t)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        targetType === t
                          ? "bg-tokyo-cyan/20 border-tokyo-cyan text-tokyo-cyan"
                          : "border-tokyo-border text-tokyo-comment hover:border-tokyo-comment"
                      }`}
                    >
                      {t === "org" ? "Org / User" : "Repo"}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={targetType === "repo" ? "owner/repo" : "github-org or username"}
                  className="w-full px-3 py-2.5 bg-tokyo-bg border border-tokyo-border rounded-lg text-tokyo-fg placeholder-tokyo-comment font-mono text-sm focus:outline-none focus:border-tokyo-blue transition-colors"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5">
                  {(["quick", "deep"] as const).map((type) => {
                    const t = SCAN_TYPE_INFO[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setScanType(type)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          scanType === type
                            ? `border-${t.color} text-${t.color} bg-${t.color}/10`
                            : "border-tokyo-border text-tokyo-comment hover:border-tokyo-comment"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  disabled={mutation.isPending || !target.trim()}
                  className="py-2.5 px-6 bg-tokyo-green text-tokyo-bg font-bold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity text-sm"
                >
                  {mutation.isPending ? "Queuing..." : `Run ${info.label} →`}
                </button>
              </div>
            </div>
            {mutation.isError && (
              <p className="text-tokyo-red text-xs">{mutation.error.message}</p>
            )}
          </form>
        </div>

        {/* Scan history */}
        {scans.length > 0 && (
          <div>
            <h2 className="text-xs font-mono font-bold text-tokyo-comment uppercase tracking-widest mb-4">
              Previous Scans
            </h2>
            <div className="space-y-3">
              {scans.map((scan) => (
                <ScanCard key={scan.id} scan={scan} />
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-xs text-tokyo-comment text-center max-w-sm mx-auto leading-relaxed">
          Public repositories only. Deep scans perform live credential verification via TruffleHog.
        </p>
      </div>
    </div>
  );
}
