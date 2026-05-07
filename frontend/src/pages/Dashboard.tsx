import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { SecretTypeChart } from "../components/SecretTypeChart";
import { TimelineChart } from "../components/TimelineChart";
import { api } from "../lib/api";
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
} from '@tanstack/react-table';

type RepoStat = {
  repo: string;
  total: number;
  maxSeverity: "critical" | "high" | "medium" | "low";
  lastCommitDate: string | null;
};

const columnHelper = createColumnHelper<RepoStat>();

const columns = [
  columnHelper.accessor('repo', {
    header: ({ column }) => {
      const isSorted = column.getIsSorted();
      return (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-tokyo-fg cursor-pointer"
        >
          Repository
          <span className="text-xs">
            {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      );
    },
    cell: info => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor('total', {
    header: ({ column }) => {
      const isSorted = column.getIsSorted();
      return (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-tokyo-fg cursor-pointer"
        >
          Findings
          <span className="text-xs">
            {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      );
    },
  }),
  columnHelper.accessor('maxSeverity', {
    header: ({ column }) => {
      const isSorted = column.getIsSorted();
      return (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-tokyo-fg cursor-pointer"
        >
          Max Severity
          <span className="text-xs">
            {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      );
    },
    cell: info => {
      const severity = info.getValue();
      const severityColors: Record<string, string> = {
        critical: 'text-tokyo-red',
        high: 'text-tokyo-orange',
        medium: 'text-tokyo-yellow',
        low: 'text-tokyo-fg',
      };
      return <span className={`capitalize ${severityColors[severity] || 'text-tokyo-fg'}`}>{severity}</span>;
    },
  }),
  columnHelper.accessor('lastCommitDate', {
    header: ({ column }) => {
      const isSorted = column.getIsSorted();
      return (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 hover:text-tokyo-fg cursor-pointer"
        >
          Last Commit
          <span className="text-xs">
            {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      );
    },
    cell: info => {
      const date = info.getValue();
      if (!date) return <span className="text-tokyo-comment">—</span>;
      return <span className="text-xs">{new Date(date).toLocaleDateString()}</span>;
    },
  }),
];

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
  const { id: scanId } = useParams<{ id: string }>();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filterText, setFilterText] = useState('');

  const { data: scan } = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", scanId],
    queryFn: () => api.getFindings(scanId!, 0, 200),
    enabled: !!scanId && scan?.scan_type === "deep" && scan?.status !== "queued",
  });

  const { repoStats, tableData } = useMemo(() => {
    if (!scan || !findings) return { repoStats: [], tableData: [] };
    const allFindings = findings.findings ?? [];

    const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };

    const repoStats = Object.entries(
      allFindings.reduce(
        (acc, f) => {
          if (!acc[f.repo_name]) {
            acc[f.repo_name] = { total: 0, maxSeverity: "low", lastCommitDate: null };
          }
          acc[f.repo_name].total++;

          // Track highest severity (lower rank = higher severity)
          if (severityRank[f.severity as keyof typeof severityRank] < severityRank[acc[f.repo_name].maxSeverity]) {
            acc[f.repo_name].maxSeverity = f.severity as "critical" | "high" | "medium" | "low";
          }

          // Track latest commit date
          if (f.commit_date) {
            if (!acc[f.repo_name].lastCommitDate || new Date(f.commit_date) > new Date(acc[f.repo_name].lastCommitDate!)) {
              acc[f.repo_name].lastCommitDate = f.commit_date;
            }
          }

          return acc;
        },
        {} as Record<string, { total: number; maxSeverity: "critical" | "high" | "medium" | "low"; lastCommitDate: string | null }>
      )
    ).sort(([, a], [, b]) => b.total - a.total);
    
    const tableData: RepoStat[] = repoStats.map(([repo, stats]) => ({
      repo,
      total: stats.total,
      maxSeverity: stats.maxSeverity,
      lastCommitDate: stats.lastCommitDate,
    }));
    return { repoStats, tableData };
  }, [scan, findings]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      globalFilter: filterText,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilterText,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-tokyo-fg">Dashboard</h1>
          <p className="text-tokyo-comment text-sm mt-1">{scan.target_name} · {scan.scan_type} scan</p>
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
        <div>
          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="repo-filter" className="text-tokyo-comment text-sm">Filter:</label>
            <input
              id="repo-filter"
              type="text"
              placeholder="Search repositories..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="px-3 py-2 bg-tokyo-bg border border-tokyo-border rounded text-tokyo-fg text-sm placeholder-tokyo-comment focus:outline-none focus:border-tokyo-blue"
            />
          </div>
          <div className="border border-tokyo-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-tokyo-bg-highlight">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="text-tokyo-comment text-left">
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-3">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-t border-tokyo-border text-tokyo-fg">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
