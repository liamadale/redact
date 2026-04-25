import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { SecretTypeChart } from "../components/SecretTypeChart";
import { TimelineChart } from "../components/TimelineChart";
import { api } from "../lib/api";
import { useScanStore } from "../stores/scanStore";

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="p-4 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg">
      <p className="text-tokyo-comment text-sm">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export function Dashboard() {
  const scanId = useScanStore((s) => s.currentScanId);

  const { data: scan } = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", scanId],
    queryFn: () => api.getFindings(scanId!, 0, 500),
    enabled: !!scanId && scan?.scan_type === "deep" && scan?.status !== "queued",
  });

  if (!scanId || !scan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <p className="text-tokyo-comment mb-4">No scan selected</p>
        <Link to="/" className="text-tokyo-blue hover:underline">
          Start a new scan
        </Link>
      </div>
    );
  }

  const allFindings = findings?.findings ?? [];
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const verifiedCount = allFindings.filter((f) => f.verified).length;
  const reposAffected = new Set(allFindings.map((f) => f.repo_name)).size;

  const repoStats = Object.entries(
    allFindings.reduce(
      (acc, f) => {
        if (!acc[f.repo_name]) acc[f.repo_name] = { total: 0, critical: 0, verified: 0 };
        acc[f.repo_name].total++;
        if (f.severity === "critical") acc[f.repo_name].critical++;
        if (f.verified) acc[f.repo_name].verified++;
        return acc;
      },
      {} as Record<string, { total: number; critical: number; verified: number }>
    )
  ).sort(([, a], [, b]) => b.total - a.total);

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-tokyo-fg">Dashboard</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link to={`/scans/${scanId}`} className="text-tokyo-blue hover:underline">
            Scan details →
          </Link>
          {scan.scan_type === "deep" && (
            <Link
              to={`/scans/${scanId}/report`}
              className="px-3 py-1.5 bg-tokyo-blue text-tokyo-bg rounded font-medium hover:opacity-90"
            >
              Generate Report
            </Link>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Findings" value={findings?.total ?? 0} color="text-tokyo-fg" />
        <StatCard label="Critical" value={criticalCount} color="text-tokyo-red" />
        <StatCard label="Verified Active" value={verifiedCount} color="text-tokyo-orange" />
        <StatCard label="Repos Affected" value={reposAffected} color="text-tokyo-yellow" />
      </div>

      {/* Charts */}
      {allFindings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="md:col-span-2 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4">
            <p className="text-tokyo-comment text-xs uppercase tracking-wide mb-3">
              Secrets by Commit Date
            </p>
            <div className="h-48">
              <TimelineChart findings={allFindings} />
            </div>
          </div>
          <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4">
            <p className="text-tokyo-comment text-xs uppercase tracking-wide mb-3">
              Secret Type Distribution
            </p>
            <div className="h-48">
              <SecretTypeChart findings={allFindings} />
            </div>
          </div>
        </div>
      )}

      {/* Repo breakdown table */}
      {repoStats.length > 0 && (
        <div className="border border-tokyo-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-tokyo-bg-highlight">
              <tr className="text-tokyo-comment text-left">
                <th className="px-4 py-3">Repository</th>
                <th className="px-4 py-3">Findings</th>
                <th className="px-4 py-3">Critical</th>
                <th className="px-4 py-3">Verified</th>
              </tr>
            </thead>
            <tbody>
              {repoStats.map(([repo, stats]) => (
                <tr key={repo} className="border-t border-tokyo-border text-tokyo-fg">
                  <td className="px-4 py-3 font-mono text-xs">{repo}</td>
                  <td className="px-4 py-3">{stats.total}</td>
                  <td className="px-4 py-3 text-tokyo-red">{stats.critical || "—"}</td>
                  <td className="px-4 py-3 text-tokyo-orange">{stats.verified || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
