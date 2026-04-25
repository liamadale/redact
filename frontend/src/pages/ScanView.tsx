import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useSSE } from "../hooks/useSSE";
import { useScanStore, type LogEntry } from "../stores/scanStore";
import { api } from "../lib/api";
import type { Scan, Finding } from "../lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

function formatMs(date: Date): string {
  return `.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

// ── Pipeline phases ───────────────────────────────────────────────────────────

const PIPELINE_PHASES = ["INIT", "ENUMERATE", "SCAN", "DONE"] as const;
type PipelinePhase = (typeof PIPELINE_PHASES)[number];

function getPhase(scan: Scan): PipelinePhase {
  if (scan.status === "queued") return "INIT";
  if (scan.status === "running" && scan.repos_total === 0) return "ENUMERATE";
  if (scan.status === "running") return "SCAN";
  return "DONE";
}

function PipelineStrip({ scan }: { scan: Scan }) {
  const current = getPhase(scan);
  const currentIdx = PIPELINE_PHASES.indexOf(current);
  const isFailed = scan.status === "failed";

  const phases = [
    { id: "INIT" as const,     label: "Init"      },
    { id: "ENUMERATE" as const,label: "Enumerate" },
    { id: "SCAN" as const,     label: "Scan Repos"},
    { id: "DONE" as const,     label: isFailed ? "Failed" : "Complete" },
  ];

  return (
    <div className="flex items-center mt-3">
      {phases.map(({ id, label }, i) => {
        const idx = PIPELINE_PHASES.indexOf(id);
        const isActive  = id === current && id !== "DONE";
        const isCurrent = id === current;
        const isPast    = idx < currentIdx;
        const isFinalFail = id === "DONE" && isFailed;
        const isFinalOk   = id === "DONE" && !isFailed && current === "DONE";

        return (
          <div key={id} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-px w-6 transition-colors duration-700 ${
                  (isPast || isCurrent) && !isFailed ? "bg-tokyo-blue/60" : "bg-tokyo-border/50"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest transition-all duration-300 ${
                isFinalFail
                  ? "text-tokyo-red border border-tokyo-red/30 bg-tokyo-red/5"
                  : isFinalOk
                  ? "text-tokyo-green border border-tokyo-green/30 bg-tokyo-green/5"
                  : isActive
                  ? "text-tokyo-yellow border border-tokyo-yellow/30 bg-tokyo-yellow/5"
                  : isPast
                  ? "text-tokyo-comment/60 border border-tokyo-border/30"
                  : isCurrent && id === "DONE"
                  ? "text-tokyo-green border border-tokyo-green/30 bg-tokyo-green/5"
                  : "text-tokyo-border/40 border border-transparent"
              }`}
            >
              {isActive  && <span className="w-1 h-1 rounded-full bg-tokyo-yellow animate-pulse" />}
              {isFinalOk && <span>✓</span>}
              {isFinalFail && <span>✗</span>}
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  queued:    { label: "QUEUED",    dot: "bg-tokyo-blue",    text: "text-tokyo-blue",    pulse: true  },
  running:   { label: "RUNNING",   dot: "bg-tokyo-yellow",  text: "text-tokyo-yellow",  pulse: true  },
  completed: { label: "COMPLETED", dot: "bg-tokyo-green",   text: "text-tokyo-green",   pulse: false },
  partial:   { label: "PARTIAL",   dot: "bg-tokyo-yellow",  text: "text-tokyo-yellow",  pulse: false },
  failed:    { label: "FAILED",    dot: "bg-tokyo-red",     text: "text-tokyo-red",     pulse: false },
} satisfies Record<Scan["status"], { label: string; dot: string; text: string; pulse: boolean }>;

function StatusBadge({ status }: { status: Scan["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

// ── Log line ──────────────────────────────────────────────────────────────────

type LogFilter = "all" | "warn" | "error";

const LOG_STYLES = {
  info:    { prefix: "text-tokyo-blue",         msg: "text-tokyo-fg/75",    bar: "bg-tokyo-blue/25"   },
  warn:    { prefix: "text-tokyo-orange",        msg: "text-tokyo-orange/90",bar: "bg-tokyo-orange/35" },
  error:   { prefix: "text-tokyo-red",           msg: "text-tokyo-red/90",   bar: "bg-tokyo-red/35"    },
  success: { prefix: "text-tokyo-green",         msg: "text-tokyo-comment",  bar: "bg-tokyo-green/25"  },
};

const LOG_ICONS: Record<LogEntry["level"], string> = {
  info: "›",
  warn: "⚠",
  error: "✗",
  success: "✓",
};

function LogLine({ entry }: { entry: LogEntry }) {
  const s = LOG_STYLES[entry.level];
  return (
    <div className="flex items-baseline gap-0 group animate-[log-in_0.15s_ease-out] py-px">
      <div className={`w-0.5 self-stretch mr-3 rounded-full ${s.bar} shrink-0`} />
      <span className="text-tokyo-comment/40 shrink-0 select-none tabular-nums text-[10px] w-24">
        {formatTime(entry.timestamp)}
        <span className="text-tokyo-comment/25">{formatMs(entry.timestamp)}</span>
      </span>
      <span className={`shrink-0 text-[10px] w-3 mr-1 ${s.prefix}`}>
        {LOG_ICONS[entry.level]}
      </span>
      <span className={`shrink-0 w-11 font-bold text-[10px] uppercase tracking-wide ${s.prefix}`}>
        {entry.prefix}
      </span>
      <span className={`${s.msg} break-all text-[11px] pl-1.5`}>{entry.message}</span>
    </div>
  );
}

function filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
  if (filter === "all") return logs;
  if (filter === "warn") return logs.filter((l) => l.level === "warn" || l.level === "error");
  return logs.filter((l) => l.level === "error");
}

// ── Findings ──────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { label: "CRIT", text: "text-tokyo-red",    pill: "bg-tokyo-red/15 text-tokyo-red"         },
  high:     { label: "HIGH", text: "text-tokyo-orange", pill: "bg-tokyo-orange/15 text-tokyo-orange"   },
  medium:   { label: "MED",  text: "text-tokyo-yellow", pill: "bg-tokyo-yellow/15 text-tokyo-yellow"   },
  low:      { label: "LOW",  text: "text-tokyo-comment",pill: "bg-white/5 text-tokyo-comment"          },
};

function SeverityBreakdown({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return null;
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high:     findings.filter((f) => f.severity === "high").length,
    medium:   findings.filter((f) => f.severity === "medium").length,
    low:      findings.filter((f) => f.severity === "low").length,
  };
  const verified = findings.filter((f) => f.verified).length;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2">
      {(["critical", "high", "medium", "low"] as const).map((sev) =>
        counts[sev] > 0 ? (
          <span key={sev} className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${SEVERITY_CONFIG[sev].pill}`}>
            {counts[sev]} {SEVERITY_CONFIG[sev].label}
          </span>
        ) : null
      )}
      {verified > 0 && (
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-tokyo-red/20 text-tokyo-red animate-pulse">
          {verified} LIVE
        </span>
      )}
    </div>
  );
}

function FindingRow({ finding, scanId }: { finding: Finding; scanId: string }) {
  const cfg = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.low;
  return (
    <Link
      to={`/scans/${scanId}/findings/${finding.id}`}
      className="flex items-start gap-2 py-2 px-3 hover:bg-white/[0.04] rounded-lg transition-colors group"
    >
      <span className={`shrink-0 text-[9px] font-bold font-mono mt-0.5 px-1.5 py-0.5 rounded ${cfg.pill}`}>
        {cfg.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-tokyo-fg text-[11px] font-medium truncate">{finding.secret_type}</p>
          {finding.verified && (
            <span className="shrink-0 text-[9px] text-tokyo-red font-bold bg-tokyo-red/10 px-1 py-0.5 rounded animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <p className="text-tokyo-comment text-[10px] font-mono truncate">{finding.repo_name}</p>
        <p className="text-tokyo-comment/50 text-[10px] font-mono truncate">
          {finding.file_path}
          {finding.line_number ? `:${finding.line_number}` : ""}
          {finding.commit_sha && (
            <span className="ml-1 text-tokyo-border/70">#{finding.commit_sha.slice(0, 7)}</span>
          )}
        </p>
      </div>
      <span className="text-tokyo-comment/30 text-[10px] opacity-0 group-hover:opacity-100 shrink-0 mt-0.5">→</span>
    </Link>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ scan }: { scan: Scan }) {
  const isIndeterminate = scan.repos_total === 0 && scan.status === "running";
  const pct =
    scan.repos_total > 0
      ? Math.round((scan.repos_scanned / scan.repos_total) * 100)
      : scan.status === "completed" ? 100 : 0;

  return (
    <div className="h-1 bg-tokyo-bg rounded-full overflow-hidden">
      {isIndeterminate ? (
        <div className="h-full w-1/3 bg-tokyo-blue/50 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" />
      ) : (
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            scan.status === "completed" ? "bg-tokyo-green"  :
            scan.status === "failed"    ? "bg-tokyo-red"    :
            scan.status === "partial"   ? "bg-tokyo-yellow" : "bg-tokyo-blue"
          }`}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ScanView() {
  const { id } = useParams<{ id: string }>();
  useSSE(id ?? null);

  const logs      = useScanStore((s) => s.logs);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [elapsed,    setElapsed]    = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter,  setLogFilter]  = useState<LogFilter>("all");

  const { data: scan } = useQuery({
    queryKey: ["scan", id],
    queryFn: () => api.getScan(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (s && ["completed", "failed", "partial"].includes(s.status)) return false;
      return 5000;
    },
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", id],
    queryFn: () => api.getFindings(id!, 0, 200),
    enabled: !!id && scan?.scan_type === "deep",
    refetchInterval: scan?.status === "running" ? 3000 : false,
  });

  const { data: hits } = useQuery({
    queryKey: ["hits", id],
    queryFn: () => api.getHits(id!),
    enabled: !!id && scan?.scan_type === "quick",
  });

  useEffect(() => {
    if (!scan) return;
    if (!["running", "queued"].includes(scan.status)) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [scan]);

  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  if (!scan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-tokyo-comment">
          <span className="w-2 h-2 rounded-full bg-tokyo-blue animate-pulse" />
          <span className="text-sm font-mono">Connecting...</span>
        </div>
      </div>
    );
  }

  const isActive    = ["running", "queued"].includes(scan.status);
  const isDone      = ["completed", "partial", "failed"].includes(scan.status);
  const pct         = scan.repos_total > 0 ? Math.round((scan.repos_scanned / scan.repos_total) * 100) : null;
  const allFindings = findings?.findings ?? [];
  const filteredLogs = filterLogs(logs, logFilter);
  const warnCount    = logs.filter((l) => l.level === "warn").length;
  const errorCount   = logs.filter((l) => l.level === "error").length;

  return (
    <div className="h-screen flex flex-col bg-tokyo-bg overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-tokyo-border bg-tokyo-bg-highlight/50 px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto">

          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-0.5">
                <h1 className="text-lg font-mono font-bold text-tokyo-fg tracking-tight">
                  {scan.target_name}
                </h1>
                <StatusBadge status={scan.status} />
              </div>
              <div className="flex items-center gap-2.5 text-[11px] text-tokyo-comment font-mono">
                <span className="uppercase tracking-wide">{scan.platform}</span>
                <span className="text-tokyo-border">·</span>
                <span className="uppercase tracking-wide">{scan.scan_type} scan</span>
                {isActive && (
                  <>
                    <span className="text-tokyo-border">·</span>
                    <span className="text-tokyo-yellow tabular-nums">{formatElapsed(elapsed)}</span>
                  </>
                )}
                {scan.completed_at && (
                  <>
                    <span className="text-tokyo-border">·</span>
                    <span>finished {new Date(scan.completed_at).toLocaleTimeString()}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isDone && scan.scan_type === "deep" && (
                <>
                  <Link
                    to="/dashboard"
                    className="px-3 py-1.5 text-[11px] border border-tokyo-border text-tokyo-comment hover:text-tokyo-fg hover:border-tokyo-fg/40 rounded transition-colors font-mono"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to={`/scans/${id}/report`}
                    className="px-3 py-1.5 text-[11px] bg-tokyo-blue text-tokyo-bg font-bold rounded hover:opacity-90 transition-opacity font-mono"
                  >
                    PDF Report
                  </Link>
                </>
              )}
              <Link
                to="/"
                className="px-3 py-1.5 text-[11px] border border-tokyo-border text-tokyo-comment hover:text-tokyo-fg rounded transition-colors font-mono"
              >
                + New Scan
              </Link>
            </div>
          </div>

          {/* Pipeline phases — deep scans only */}
          {scan.scan_type === "deep" && <PipelineStrip scan={scan} />}

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
              <span className="text-tokyo-comment">
                {scan.status === "queued" && (
                  <span className="text-tokyo-blue/70">waiting for worker...</span>
                )}
                {scan.status === "running" && scan.repos_total === 0 && (
                  <span>
                    enumerating repositories
                    <span className="animate-pulse">...</span>
                  </span>
                )}
                {scan.status === "running" && scan.repos_total > 0 && (
                  <span>
                    <span className="text-tokyo-fg font-bold">{scan.repos_scanned}</span>
                    <span className="text-tokyo-border"> / </span>
                    <span>{scan.repos_total} repos</span>
                    {scan.current_repo && (
                      <>
                        <span className="text-tokyo-border mx-2">·</span>
                        <span>scanning </span>
                        <span className="text-tokyo-cyan font-bold">{scan.current_repo}</span>
                        <span className="inline-block w-1.5 h-[0.7em] bg-tokyo-cyan/70 ml-0.5 align-middle animate-[cursor-blink_1s_step-end_infinite]" />
                      </>
                    )}
                  </span>
                )}
                {isDone && (
                  <span>
                    {scan.repos_scanned} repo{scan.repos_scanned !== 1 ? "s" : ""} scanned
                    {scan.status === "partial" && (
                      <span className="ml-2 text-tokyo-yellow">· partial results</span>
                    )}
                  </span>
                )}
              </span>
              <span className={pct !== null ? "text-tokyo-fg font-bold tabular-nums" : "text-tokyo-comment"}>
                {pct !== null ? `${pct}%` : "—"}
              </span>
            </div>
            <ProgressBar scan={scan} />
          </div>

          {/* Severity breakdown */}
          {allFindings.length > 0 && <SeverityBreakdown findings={allFindings} />}
        </div>
      </div>

      {/* ── Main split pane ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden max-w-7xl w-full mx-auto px-6 py-4 gap-4 min-h-0">

        {/* Log panel */}
        <div className="flex-1 min-w-0 flex flex-col bg-tokyo-bg-highlight/30 border border-tokyo-border rounded-lg overflow-hidden">

          {/* Log header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-tokyo-border bg-tokyo-bg/50 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold text-tokyo-comment/60 uppercase tracking-widest mr-2">
                Worker Log
              </span>
              {/* Filter: ALL */}
              <button
                type="button"
                onClick={() => setLogFilter("all")}
                className={`px-2 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                  logFilter === "all"
                    ? "border-tokyo-blue/50 text-tokyo-blue bg-tokyo-blue/5"
                    : "border-transparent text-tokyo-comment/40 hover:text-tokyo-comment"
                }`}
              >
                ALL {logs.length}
              </button>
              {/* Filter: WARN (only shown when there are warnings) */}
              {warnCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLogFilter("warn")}
                  className={`px-2 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                    logFilter === "warn"
                      ? "border-tokyo-orange/50 text-tokyo-orange bg-tokyo-orange/5"
                      : "border-tokyo-border/60 text-tokyo-comment hover:border-tokyo-comment"
                  }`}
                >
                  WARN {warnCount}
                </button>
              )}
              {/* Filter: ERR (only shown when there are errors) */}
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLogFilter("error")}
                  className={`px-2 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                    logFilter === "error"
                      ? "border-tokyo-red/50 text-tokyo-red bg-tokyo-red/5"
                      : "border-tokyo-border/60 text-tokyo-comment hover:border-tokyo-comment"
                  }`}
                >
                  ERR {errorCount}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAutoScroll((v) => !v)}
              className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                autoScroll
                  ? "border-tokyo-blue/40 text-tokyo-blue/70"
                  : "border-tokyo-border/40 text-tokyo-comment/40 hover:border-tokyo-border"
              }`}
            >
              {autoScroll ? "⇣ LIVE" : "⇣ PAUSED"}
            </button>
          </div>

          {/* Log body */}
          <div className="flex-1 overflow-y-auto p-3 font-mono leading-5 space-y-0">
            {filteredLogs.length === 0 ? (
              <p className="text-tokyo-comment/30 p-2 text-[10px]">
                {logFilter === "all" ? "Waiting for worker events..." : "No events match this filter."}
              </p>
            ) : (
              filteredLogs.map((entry) => <LogLine key={entry.id} entry={entry} />)
            )}
            {/* Terminal cursor when scanning is active */}
            {isActive && (
              <div className="flex items-baseline gap-0 py-px opacity-25">
                <div className="w-0.5 self-stretch mr-3 shrink-0" />
                <span className="text-tokyo-comment/40 text-[10px] w-24 tabular-nums select-none">
                  {formatTime(new Date())}
                  <span className="text-tokyo-comment/20">.000</span>
                </span>
                <span className="text-[10px] w-3 mr-1" />
                <span className="inline-block w-2 h-[0.7em] bg-tokyo-comment/50 animate-[cursor-blink_1s_step-end_infinite]" />
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Findings / hits sidebar */}
        <div className="w-80 shrink-0 flex flex-col bg-tokyo-bg-highlight/30 border border-tokyo-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-tokyo-border bg-tokyo-bg/50 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-tokyo-comment/60 uppercase tracking-widest">
                {scan.scan_type === "deep" ? "Findings" : "Search Hits"}
              </span>
              <span className="text-[10px] font-mono text-tokyo-comment/50 tabular-nums">
                {scan.scan_type === "deep" ? findings?.total ?? 0 : hits?.total ?? 0} total
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {scan.scan_type === "deep" && (
              allFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-1 text-[11px] font-mono">
                  {isActive ? (
                    <>
                      <span className="text-tokyo-comment/50 animate-pulse">scanning...</span>
                      <span className="text-tokyo-comment/25 text-[10px]">findings stream here</span>
                    </>
                  ) : (
                    <span className="text-tokyo-green text-[11px]">✓ no findings</span>
                  )}
                </div>
              ) : (
                <div className="space-y-px px-1">
                  {allFindings.map((f: Finding) => (
                    <FindingRow key={f.id} finding={f} scanId={id!} />
                  ))}
                </div>
              )
            )}

            {scan.scan_type === "quick" && (
              !hits || hits.total === 0 ? (
                <div className="flex items-center justify-center h-32 text-[11px] font-mono text-tokyo-comment/50">
                  {isActive ? (
                    <span className="animate-pulse">searching github index...</span>
                  ) : (
                    <span>no hits</span>
                  )}
                </div>
              ) : (
                <div className="space-y-px px-1 py-1">
                  {hits.hits.map((h, i) => (
                    <div key={i} className="px-3 py-2 hover:bg-white/[0.04] rounded-lg group">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-mono font-bold text-tokyo-blue bg-tokyo-blue/10 px-1.5 py-0.5 rounded">
                          {h.matched_pattern}
                        </span>
                      </div>
                      <p className="text-tokyo-fg text-[11px] font-medium truncate">{h.repo_name}</p>
                      <p className="text-tokyo-comment text-[10px] font-mono truncate">{h.file_path}</p>
                      {h.html_url && (
                        <a
                          href={h.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-tokyo-blue/60 hover:text-tokyo-blue hover:underline transition-colors"
                        >
                          view on github →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Completion banners ────────────────────────────────────────────────── */}
      {scan.status === "completed" && allFindings.length === 0 && !hits?.total && (
        <div className="border-t border-tokyo-green/20 px-6 py-2.5 bg-tokyo-green/5 shrink-0">
          <div className="max-w-7xl mx-auto text-[11px] font-mono text-tokyo-green">
            ✓ scan complete — no secrets detected
          </div>
        </div>
      )}
      {scan.status === "partial" && (
        <div className="border-t border-tokyo-yellow/20 px-6 py-2.5 bg-tokyo-yellow/5 shrink-0">
          <div className="max-w-7xl mx-auto text-[11px] font-mono text-tokyo-yellow">
            ⚠ scan timed out on one or more repos — results may be incomplete
          </div>
        </div>
      )}
      {scan.status === "failed" && (
        <div className="border-t border-tokyo-red/20 px-6 py-2.5 bg-tokyo-red/5 shrink-0">
          <div className="max-w-7xl mx-auto text-[11px] font-mono text-tokyo-red">
            ✗ scan failed — see worker log for details
          </div>
        </div>
      )}
    </div>
  );
}
