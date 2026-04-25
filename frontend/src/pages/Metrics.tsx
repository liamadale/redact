import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { useScanStore } from "../stores/scanStore";
import type { Finding } from "../lib/types";

const SEV_COLORS: Record<string, string> = {
  critical: "#f7768e",
  high: "#ff9e64",
  medium: "#e0af68",
  low: "#565f89",
};

const TOOLTIP_STYLE = {
  background: "#24283b",
  border: "1px solid #3b4261",
  borderRadius: 6,
  color: "#c0caf5",
  fontSize: 12,
};

interface RepoSevPoint {
  repo: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

function buildRepoSeverityData(findings: Finding[]): RepoSevPoint[] {
  const map: Record<string, Record<string, number>> = {};
  for (const f of findings) {
    if (!map[f.repo_name]) map[f.repo_name] = { critical: 0, high: 0, medium: 0, low: 0 };
    map[f.repo_name][f.severity]++;
  }
  return Object.entries(map)
    .map(([name, counts]) => ({
      repo: name.split("/").pop() ?? name,
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
    }))
    .sort((a, b) => (b.critical + b.high + b.medium + b.low) - (a.critical + a.high + a.medium + a.low));
}

function buildVerifiedData(findings: Finding[]) {
  const verified = findings.filter((f) => f.verified).length;
  const unverified = findings.length - verified;
  return [
    { name: "Verified Active", value: verified },
    { name: "Unverified", value: unverified },
  ].filter((d) => d.value > 0);
}

function buildAuthorData(findings: Finding[]) {
  const map: Record<string, number> = {};
  for (const f of findings) {
    const author = f.commit_author ?? "Unknown";
    map[author] = (map[author] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function Metrics() {
  const scanId = useScanStore((s) => s.currentScanId);

  const { data: scan } = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", scanId, "metrics"],
    queryFn: () => api.getFindings(scanId!, 0, 200),
    enabled: !!scanId,
  });

  if (!scanId || !scan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <p className="text-tokyo-comment mb-4">No scan selected</p>
        <Link to="/" className="text-tokyo-blue hover:underline">Start a new scan</Link>
      </div>
    );
  }

  const allFindings = findings?.findings ?? [];
  const repoSevData = useMemo(() => buildRepoSeverityData(allFindings), [allFindings]);
  const verifiedData = useMemo(() => buildVerifiedData(allFindings), [allFindings]);
  const authorData = useMemo(() => buildAuthorData(allFindings), [allFindings]);

  const sevCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of allFindings) c[f.severity]++;
    return c;
  }, [allFindings]);

  const uniqueTypes = new Set(allFindings.map((f) => f.secret_type)).size;
  const uniqueRepos = new Set(allFindings.map((f) => f.repo_name)).size;
  const avgPerRepo = uniqueRepos > 0 ? (allFindings.length / uniqueRepos).toFixed(1) : "0";

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-tokyo-fg">Metrics</h1>
          <p className="text-tokyo-comment text-sm mt-1">
            {scan.target_name} · {allFindings.length} findings across {uniqueRepos} repos
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link to="/dashboard" className="text-tokyo-comment hover:text-tokyo-fg">Dashboard</Link>
          <Link to={`/scans/${scanId}`} className="text-tokyo-blue hover:underline">Scan →</Link>
        </div>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {([
          ["Total", allFindings.length, "text-tokyo-fg"],
          ["Critical", sevCounts.critical, "text-tokyo-red"],
          ["High", sevCounts.high, "text-tokyo-orange"],
          ["Secret Types", uniqueTypes, "text-tokyo-cyan"],
          ["Avg / Repo", avgPerRepo, "text-tokyo-magenta"],
        ] as const).map(([label, value, color]) => (
          <div key={label} className="p-3 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg">
            <p className="text-tokyo-comment text-xs">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {allFindings.length === 0 ? (
        <p className="text-tokyo-comment text-center py-16">No findings to analyze.</p>
      ) : (
        <>
          {/* Row 1: Repo severity breakdown + verified pie */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4">
              <p className="text-tokyo-comment text-xs uppercase tracking-wide mb-3">
                Findings by Repository
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={repoSevData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3b4261" />
                    <XAxis
                      dataKey="repo"
                      tick={{ fill: "#565f89", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#3b4261" }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#565f89", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    {(["critical", "high", "medium", "low"] as const).map((s) => (
                      <Bar key={s} dataKey={s} stackId="a" fill={SEV_COLORS[s]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4">
              <p className="text-tokyo-comment text-xs uppercase tracking-wide mb-3">
                Verification Status
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={verifiedData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius="60%"
                      strokeWidth={0}
                    >
                      {verifiedData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.name === "Verified Active" ? "#f7768e" : "#3b4261"}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#c0caf5" }} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Top authors */}
          {authorData.length > 0 && (
            <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4">
              <p className="text-tokyo-comment text-xs uppercase tracking-wide mb-3">
                Top Committers with Leaked Secrets
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={authorData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3b4261" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: "#565f89", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "#c0caf5", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={150}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" fill="#7aa2f7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
