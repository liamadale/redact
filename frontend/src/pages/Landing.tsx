import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useScanStore } from "../stores/scanStore";
import type { ScanCreate } from "../lib/types";

const SCAN_TYPE_INFO = {
  quick: {
    label: "Quick Scan",
    badge: "Search API",
    description: "Searches GitHub's code index for secret patterns. Fast — no cloning. Best for triage.",
    color: "tokyo-blue",
  },
  deep: {
    label: "Deep Scan",
    badge: "Full History",
    description: "Clones repos, runs TruffleHog across all branches and commits. Finds everything.",
    color: "tokyo-magenta",
  },
} as const;

export function Landing() {
  const navigate = useNavigate();
  const setCurrentScanId = useScanStore((s) => s.setCurrentScanId);
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<"quick" | "deep">("quick");
  const [targetType, setTargetType] = useState<"org" | "repo">("org");

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

  const info = SCAN_TYPE_INFO[scanType];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      {/* Wordmark */}
      <div className="mb-12 text-center">
        <h1 className="text-6xl font-black tracking-tight text-tokyo-fg mb-3">
          REDACT
        </h1>
        <p className="text-tokyo-comment text-sm tracking-widest uppercase">
          Git Secrets Auditor
        </p>
      </div>

      {/* Form card */}
      <div className="w-full max-w-lg bg-tokyo-bg-highlight border border-tokyo-border rounded-xl p-8 shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Target input */}
          <div>
            <label className="block text-tokyo-comment text-xs uppercase tracking-widest mb-2">
              Target
            </label>
            <div className="flex gap-2 mb-3">
              {(["org", "repo"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetType(t)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                    targetType === t
                      ? "bg-tokyo-cyan/20 border-tokyo-cyan text-tokyo-cyan"
                      : "border-tokyo-border text-tokyo-comment hover:border-tokyo-comment"
                  }`}
                >
                  {t === "org" ? "Org / User" : "Single Repo"}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={
                targetType === "repo"
                  ? "owner/repo"
                  : "github-org or username"
              }
              className="w-full px-4 py-3 bg-tokyo-bg border border-tokyo-border rounded-lg text-tokyo-fg placeholder-tokyo-comment font-mono text-sm focus:outline-none focus:border-tokyo-blue transition-colors"
              autoFocus
            />
          </div>

          {/* Scan type */}
          <div>
            <label className="block text-tokyo-comment text-xs uppercase tracking-widest mb-2">
              Scan Type
            </label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {(["quick", "deep"] as const).map((type) => {
                const t = SCAN_TYPE_INFO[type];
                const active = scanType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setScanType(type)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      active
                        ? `border-${t.color} bg-${t.color}/10`
                        : "border-tokyo-border hover:border-tokyo-comment"
                    }`}
                  >
                    <div className={`text-sm font-semibold mb-0.5 ${active ? `text-${t.color}` : "text-tokyo-fg"}`}>
                      {t.label}
                    </div>
                    <div className="text-tokyo-comment text-xs">{t.badge}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-tokyo-comment text-xs leading-relaxed">
              {info.description}
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={mutation.isPending || !target.trim()}
            className="w-full py-3 bg-tokyo-green text-tokyo-bg font-bold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity text-sm tracking-wide"
          >
            {mutation.isPending ? "Queuing scan..." : `Run ${info.label} →`}
          </button>

          {mutation.isError && (
            <p className="text-tokyo-red text-xs text-center">
              {mutation.error.message}
            </p>
          )}
        </form>
      </div>

      <p className="mt-8 text-xs text-tokyo-comment text-center max-w-sm leading-relaxed">
        Public repositories only. Deep scans perform live credential verification
        via TruffleHog. Authorized use only.
      </p>
    </div>
  );
}
