import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-tokyo-red",
  high: "text-tokyo-orange",
  medium: "text-tokyo-yellow",
  low: "text-tokyo-comment",
};

export function Report() {
  const { scanId } = useParams<{ scanId: string }>();
  const [downloading, setDownloading] = useState<"pdf" | "json" | null>(null);

  const { data: scan } = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId!),
    enabled: !!scanId,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", scanId],
    queryFn: () => api.getFindings(scanId!, 0, 500),
    enabled: !!scanId,
  });

  const handleDownload = async (format: "pdf" | "json") => {
    if (!scanId) return;
    setDownloading(format);
    try {
      const blob = await api.downloadReport(scanId, format);
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

  const allFindings = findings?.findings ?? [];
  const severityGroups = {
    critical: allFindings.filter((f) => f.severity === "critical"),
    high: allFindings.filter((f) => f.severity === "high"),
    medium: allFindings.filter((f) => f.severity === "medium"),
    low: allFindings.filter((f) => f.severity === "low"),
  };
  const verifiedCount = allFindings.filter((f) => f.verified).length;

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

      {/* Summary */}
      <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-5 mb-6">
        <h2 className="text-base font-semibold text-tokyo-fg mb-4">Findings Summary</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-tokyo-comment">Total findings</span>
            <span className="text-tokyo-fg font-medium">{findings?.total ?? 0}</span>
          </div>
          {(["critical", "high", "medium", "low"] as const).map((s) => (
            <div key={s} className="flex justify-between">
              <span className="text-tokyo-comment capitalize">{s}</span>
              <span className={`font-medium ${SEVERITY_COLORS[s]}`}>
                {severityGroups[s].length}
              </span>
            </div>
          ))}
          <div className="flex justify-between col-span-2 pt-2 border-t border-tokyo-border">
            <span className="text-tokyo-comment">Verified active</span>
            <span className={`font-medium ${verifiedCount > 0 ? "text-tokyo-red" : "text-tokyo-fg"}`}>
              {verifiedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Included content note */}
      <div className="text-tokyo-comment text-sm mb-6 space-y-1">
        <p>The report will include:</p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Executive summary with severity breakdown</li>
          <li>NIST 800-53 and DISA STIG compliance mapping</li>
          <li>All {findings?.total ?? 0} findings with location and commit metadata</li>
          <li>Remediation roadmap</li>
        </ul>
      </div>

      {/* Download buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleDownload("pdf")}
          disabled={downloading !== null || !findings}
          className="flex-1 py-2.5 bg-tokyo-blue text-tokyo-bg rounded font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading === "pdf" ? "Generating PDF…" : "Download PDF"}
        </button>
        <button
          onClick={() => handleDownload("json")}
          disabled={downloading !== null || !findings}
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
