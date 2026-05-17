import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Finding, Scan } from "../lib/types";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

const SEVERITY_CONFIG: Record<NonNullable<Finding["severity"]>, { label: string; text: string; bg: string }> = {
  critical: { label: "CRIT", text: "text-tokyo-red", bg: "bg-tokyo-red/10" },
  high: { label: "HIGH", text: "text-tokyo-orange", bg: "bg-tokyo-orange/10" },
  medium: { label: "MED", text: "text-tokyo-yellow", bg: "bg-tokyo-yellow/10" },
  low: { label: "LOW", text: "text-tokyo-comment", bg: "bg-white/5" },
};

type RepoSummary = {
  repo: string;
  totalCount: number;
  totalHits?: number;
  totalFindings?: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  maxSeverity?: Finding["severity"];
};

function RepoSearchResults() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data: scan } = useQuery<Scan>({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", scanId],
    queryFn: () => api.getFindings(scanId!, 0, 200),
    enabled: !!scanId && scan?.scan_type === "deep",
  });

  const { data: hits } = useQuery({
    queryKey: ["hits", scanId],
    queryFn: () => api.getHits(scanId!),
    enabled: !!scanId && scan?.scan_type === "quick",
  });

  const repoSummaries = useMemo<RepoSummary[]>(() => {
    if (!scan) return [];

    const map = new Map<string, RepoSummary>();

    if (scan.scan_type === "deep") {
      const allFindings = findings?.findings ?? [];
      for (const finding of allFindings) {
        const repo = finding.repo_name;
        if (!map.has(repo)) {
          map.set(repo, {
            repo,
            totalCount: 0,
            totalFindings: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          });
        }
        const entry = map.get(repo)!;
        entry.totalCount += 1;
        entry.totalFindings = (entry.totalFindings ?? 0) + 1;
        entry[finding.severity] += 1;

        const candidate = finding.severity;
        if (!entry.maxSeverity || SEVERITY_ORDER.indexOf(candidate) < SEVERITY_ORDER.indexOf(entry.maxSeverity)) {
          entry.maxSeverity = candidate;
        }
      }
    }

    if (scan.scan_type === "quick") {
      const allHits = hits?.hits ?? [];
      for (const hit of allHits) {
        const repo = hit.repo_name;
        if (!map.has(repo)) {
          map.set(repo, {
            repo,
            totalCount: 0,
            totalHits: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          });
        }
        const entry = map.get(repo)!;
        entry.totalCount += 1;
        entry.totalHits = (entry.totalHits ?? 0) + 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.repo.localeCompare(b.repo);
    });
  }, [scan, findings, hits]);

  const deepScanMutation = useMutation({
    mutationFn: (repoName: string) =>
      api.createScan({
        target_type: "repo",
        target_name: repoName,
        scan_type: "deep",
      }),
    onSuccess: (scan) => {
      navigate(`/scans/${scan.id}`);
    },
    onError: (error: any) => {
      setStatusMessage(error?.message ?? "Unable to queue deep scan.");
    },
  });

  const isDeepScanLoading = deepScanMutation.status === "pending";

  const handleToggleRepo = (repo: string) => {
    setSelectedRepos((prev) =>
      prev.includes(repo) ? prev.filter((name) => name !== repo) : [...prev, repo]
    );
  };

  const handleBulkDeepScan = async () => {
    if (!selectedRepos.length) return;
    setStatusMessage(null);
    setBulkLoading(true);

    const results = await Promise.allSettled(
      selectedRepos.map((repo) =>
        api.createScan({ target_type: "repo", target_name: repo, scan_type: "deep" })
      )
    );

    setBulkLoading(false);
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;
    setSelectedRepos([]);
    setStatusMessage(
      `${successCount} deep scan${successCount === 1 ? "" : "s"} queued${failedCount ? `, ${failedCount} failed` : ""}.`
    );
  };

  if (!scanId || !scan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <p className="text-tokyo-comment mb-4">No scan selected.</p>
        <Link to="/" className="text-tokyo-blue hover:underline">Start a new scan</Link>
      </div>
    );
  }

  const isQuick = scan.scan_type === "quick";
  const isDeep = scan.scan_type === "deep";

  return (
    <div className="min-h-screen bg-tokyo-bg px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-bold text-tokyo-fg">{scan.target_name}</h1>
            <p className="mt-2 text-sm text-tokyo-comment">
              {scan.scan_type === "quick" ? "High-level repository search results from the quick scan." : "Findings grouped by repository."}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {selectedRepos.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDeepScan}
                disabled={bulkLoading}
                className="inline-flex items-center justify-center rounded-md border border-tokyo-blue/40 bg-tokyo-blue/10 px-4 py-2 text-sm font-semibold text-tokyo-blue hover:bg-tokyo-blue/15 disabled:opacity-50"
              >
                {bulkLoading ? "Queuing..." : `Deep scan ${selectedRepos.length} selected`}
              </button>
            )}
            <Link
              to={`/scans/${scanId}`}
              className="inline-flex items-center justify-center rounded-md border border-tokyo-border bg-tokyo-bg-highlight px-4 py-2 text-sm font-semibold text-tokyo-fg hover:bg-tokyo-blue/15"
            >
              Back to scan
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-tokyo-comment">
          <span>{repoSummaries.length} repositories</span>
          <span className="h-4 w-px bg-tokyo-border" />
          <span>{isQuick ? `${hits?.total ?? 0} total hits` : `${findings?.total ?? 0} total findings`}</span>
          <span className="h-4 w-px bg-tokyo-border" />
          <span>Scan status: {scan.status.toUpperCase()}</span>
        </div>

        {statusMessage && (
          <div className="mb-4 rounded-lg border border-tokyo-blue/30 bg-tokyo-blue/5 px-4 py-3 text-sm text-tokyo-fg">
            {statusMessage}
          </div>
        )}

        {repoSummaries.length === 0 ? (
          <div className="rounded-3xl border border-tokyo-border bg-tokyo-bg-highlight p-10 text-center text-sm text-tokyo-comment">
            {scan.status === "running" ? "Scanning repositories..." : "No repositories found yet."}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {repoSummaries.map((repo) => {
              const isSelected = selectedRepos.includes(repo.repo);
              return (
                <div key={repo.repo} className="group rounded-lg border border-tokyo-border bg-tokyo-bg-highlight p-5 transition hover:border-tokyo-blue/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">  
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRepo(repo.repo)}
                          className="cursor-pointer"
                        />
                        <h2 className="text-base font-semibold text-tokyo-fg break-words">
                          {repo.repo}
                        </h2>
                      </label>
                      </div>
                      <p className="mt-2 text-[11px] text-tokyo-comment">{isQuick ? `${repo.totalHits ?? 0} search hits` : `${repo.totalFindings ?? 0} findings`}</p>
                    </div>

                    {/* Maximum finding severity */}
                    <div
                      className={`shrink-0 bg-tokyo-blue rounded border border-tokyo-border px-3 py-1 text-[10px] font-mono uppercase ${
                        isQuick
                          ? "bg-tokyo-bg text-tokyo-comment"
                          : `${SEVERITY_CONFIG[repo.maxSeverity ?? "low"].bg} ${SEVERITY_CONFIG[repo.maxSeverity ?? "low"].text}`
                      }`}
                    >
                      {isQuick ? "SEARCH" : repo.maxSeverity?.toUpperCase() ?? "LOW"}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isDeep && SEVERITY_ORDER.map((level) =>
                      repo[level] > 0 ? (
                        <span
                          key={level}
                          className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded ${SEVERITY_CONFIG[level].bg} ${SEVERITY_CONFIG[level].text}`}
                        >
                          {repo[level]} {SEVERITY_CONFIG[level].label}
                        </span>
                      ) : null
                    )}
                    {isQuick && repo.totalHits && (
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-tokyo-blue/10 text-tokyo-blue">
                        {repo.totalHits} hits
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => deepScanMutation.mutate(repo.repo)}
                      disabled={isDeepScanLoading}
                      className="w-full rounded-md border border-tokyo-blue/40 bg-tokyo-blue/10 px-4 py-2 text-sm font-semibold text-tokyo-blue cursor-pointer transition hover:bg-tokyo-blue/15 disabled:opacity-50 sm:w-auto"
                    >
                      {isDeepScanLoading ? "Queuing..." : "Deep scan repo"}
                    </button>
                    <Link
                      to={`/scans/${scanId}`}
                      className="w-full text-center rounded-md border border-tokyo-border bg-tokyo-blue/10 px-4 py-2 text-sm text-tokyo-fg sm:w-auto transition hover:bg-tokyo-blue/15"
                    >
                      View scan
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { RepoSearchResults };
