import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-tokyo-red",
  high: "bg-tokyo-orange",
  medium: "bg-tokyo-yellow",
  low: "bg-tokyo-comment",
};

const FRAMEWORK_LABELS: Record<string, string> = {
  NIST_800_53: "NIST 800-53",
  DISA_STIG: "DISA STIG",
};

function RemediationGuide({ secretType, verified }: { secretType: string; verified: boolean | null }) {
  const isKey = /private.*key|rsa|ssh|ec.*key/i.test(secretType);
  const isPassword = /password/i.test(secretType);

  return (
    <div className="space-y-3 text-sm text-tokyo-comment">
      {verified && (
        <div className="p-3 border border-tokyo-red/40 bg-tokyo-red/10 rounded text-tokyo-red">
          <span className="font-semibold">Verified active.</span> Rotate this credential immediately
          before any other step.
        </div>
      )}
      <ol className="list-decimal list-inside space-y-2 text-tokyo-fg">
        <li>
          <span className="font-medium">Rotate the credential</span> — invalidate it in the issuing
          service (AWS IAM, GitHub settings, Stripe dashboard, etc.)
        </li>
        <li>
          <span className="font-medium">Remove from current branch</span> — delete the value from
          the file and commit the change
        </li>
        <li>
          <span className="font-medium">Clean git history</span> — use{" "}
          <code className="text-tokyo-cyan bg-tokyo-bg px-1 rounded">git filter-repo</code> or BFG
          Repo-Cleaner to purge the secret from all commits, then force-push
        </li>
        {isKey && (
          <li>
            <span className="font-medium">Generate a new key pair</span> — never reuse the
            compromised key
          </li>
        )}
        {isPassword && (
          <li>
            <span className="font-medium">Move to environment variables</span> — reference via{" "}
            <code className="text-tokyo-cyan bg-tokyo-bg px-1 rounded">os.environ</code> or a
            secrets manager, never hardcode
          </li>
        )}
        <li>
          <span className="font-medium">Add pre-commit scanning</span> — install TruffleHog or
          GitLeaks as a pre-commit hook to prevent future leaks
        </li>
      </ol>
    </div>
  );
}

export function FindingDetail() {
  const { scanId, findingId } = useParams<{ scanId: string; findingId: string }>();

  const { data: finding, isLoading, isError } = useQuery({
    queryKey: ["finding", scanId, findingId],
    queryFn: () => api.getFinding(scanId!, findingId!),
    enabled: !!scanId && !!findingId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-tokyo-comment">Loading...</p>
      </div>
    );
  }

  if (isError || !finding) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-tokyo-red">Finding not found</p>
        <Link to={`/scans/${scanId}`} className="text-tokyo-blue hover:underline text-sm">
          ← Back to scan
        </Link>
      </div>
    );
  }

  const nistControls = finding.compliance_controls.filter(
    (c) => c.framework === "NIST_800_53"
  );
  const stigControls = finding.compliance_controls.filter(
    (c) => c.framework === "DISA_STIG"
  );

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link
        to={`/scans/${scanId}`}
        className="text-tokyo-comment hover:text-tokyo-fg text-sm mb-6 inline-block"
      >
        ← Back to scan
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`px-2 py-0.5 rounded text-xs text-tokyo-bg font-medium ${SEVERITY_COLORS[finding.severity] ?? "bg-tokyo-comment"}`}
        >
          {finding.severity}
        </span>
        <h1 className="text-2xl font-bold text-tokyo-fg">{finding.secret_type}</h1>
        {finding.verified && (
          <span className="px-2 py-0.5 rounded text-xs bg-tokyo-red text-tokyo-bg font-medium">
            ● verified active
          </span>
        )}
      </div>

      {/* Secret preview */}
      {finding.redacted_secret && (
        <div className="mb-6 p-4 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg">
          <p className="text-tokyo-comment text-xs mb-2 uppercase tracking-wide">
            Secret (redacted)
          </p>
          <code className="text-tokyo-cyan font-mono">{finding.redacted_secret}</code>
        </div>
      )}

      {/* Location + commit info */}
      <div className="mb-6 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg divide-y divide-tokyo-border">
        {[
          { label: "Repository", value: finding.repo_name },
          {
            label: "File",
            value: `${finding.file_path}${finding.line_number ? `:${finding.line_number}` : ""}`,
            mono: true,
          },
          finding.commit_sha && {
            label: "Commit",
            value: `${finding.commit_sha.slice(0, 8)}${finding.commit_date ? ` · ${new Date(finding.commit_date).toLocaleDateString()}` : ""}`,
            mono: true,
          },
          finding.commit_author && { label: "Author", value: finding.commit_author },
          finding.commit_message && { label: "Message", value: finding.commit_message },
          finding.branch_status && {
            label: "Branch Status",
            value: finding.branch_status === "current" ? "On current branch" : "History only",
          },
          finding.occurrence_count > 1 && {
            label: "Occurrences",
            value: `Found in ${finding.occurrence_count} commits`,
          },
        ]
          .filter(Boolean)
          .map((row) => {
            if (!row) return null;
            return (
              <div key={row.label} className="flex px-4 py-3 gap-4">
                <span className="text-tokyo-comment text-sm w-28 shrink-0">{row.label}</span>
                <span
                  className={`text-tokyo-fg text-sm break-all ${row.mono ? "font-mono text-xs" : ""}`}
                >
                  {row.value}
                </span>
              </div>
            );
          })}
      </div>

      {/* Compliance mapping */}
      {finding.compliance_controls.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-tokyo-fg mb-3">Compliance Impact</h2>
          <div className="space-y-3">
            {[
              { controls: nistControls, label: "NIST 800-53" },
              { controls: stigControls, label: "DISA STIG" },
            ]
              .filter((g) => g.controls.length > 0)
              .map((group) => (
                <div
                  key={group.label}
                  className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-2 bg-tokyo-bg border-b border-tokyo-border">
                    <span className="text-tokyo-comment text-xs font-medium uppercase tracking-wide">
                      {group.label}
                    </span>
                  </div>
                  {group.controls.map((c) => (
                    <div
                      key={c.control_id}
                      className="px-4 py-3 border-b border-tokyo-border last:border-0"
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-tokyo-yellow font-mono text-sm font-bold">
                          {c.control_id}
                        </span>
                        <span className="text-tokyo-fg text-sm">{c.control_title}</span>
                        <span className="ml-auto text-tokyo-red text-xs font-medium">FAIL</span>
                      </div>
                      {c.description && (
                        <p className="text-tokyo-comment text-xs">{c.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Remediation guidance */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-tokyo-fg mb-3">Remediation</h2>
        <div className="bg-tokyo-bg-highlight border border-tokyo-border rounded-lg p-4">
          <RemediationGuide
            secretType={finding.secret_type}
            verified={finding.verified}
          />
        </div>
      </div>

      {/* Framework labels */}
      {[
        { controls: nistControls, key: "NIST_800_53" },
        { controls: stigControls, key: "DISA_STIG" },
      ]
        .filter((g) => g.controls.length > 0)
        .map((g) => (
          <p key={g.key} className="text-tokyo-comment text-xs">
            {FRAMEWORK_LABELS[g.key]}:{" "}
            {g.controls.map((c) => c.control_id).join(", ")}
          </p>
        ))}
    </div>
  );
}
