import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useScanStore } from "../stores/scanStore";
import type { ScanCreate } from "../lib/types";

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
    mutation.mutate({
      target_type: targetType,
      target_name: target.trim(),
      scan_type: scanType,
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold text-tokyo-fg mb-2">Redact</h1>
      <p className="text-tokyo-comment mb-8">
        Scan GitHub organizations for leaked secrets
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={targetType === "repo" ? "owner/repo (e.g. trufflesecurity/test_keys)" : "GitHub org or username"}
          className="w-full px-4 py-3 bg-tokyo-bg-highlight border border-tokyo-border rounded-lg text-tokyo-fg placeholder-tokyo-comment focus:outline-none focus:border-tokyo-blue"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setTargetType("org")}
            className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
              targetType === "org"
                ? "bg-tokyo-cyan text-tokyo-bg border-tokyo-cyan"
                : "border-tokyo-border text-tokyo-comment hover:border-tokyo-cyan"
            }`}
          >
            Org / User
          </button>
          <button
            type="button"
            onClick={() => setTargetType("repo")}
            className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
              targetType === "repo"
                ? "bg-tokyo-cyan text-tokyo-bg border-tokyo-cyan"
                : "border-tokyo-border text-tokyo-comment hover:border-tokyo-cyan"
            }`}
          >
            Single Repo
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setScanType("quick")}
            className={`flex-1 py-2 rounded-lg border transition-colors ${
              scanType === "quick"
                ? "bg-tokyo-blue text-tokyo-bg border-tokyo-blue"
                : "border-tokyo-border text-tokyo-comment hover:border-tokyo-blue"
            }`}
          >
            Quick Scan
          </button>
          <button
            type="button"
            onClick={() => setScanType("deep")}
            className={`flex-1 py-2 rounded-lg border transition-colors ${
              scanType === "deep"
                ? "bg-tokyo-magenta text-tokyo-bg border-tokyo-magenta"
                : "border-tokyo-border text-tokyo-comment hover:border-tokyo-magenta"
            }`}
          >
            Deep Scan
          </button>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending || !target.trim()}
          className="w-full py-3 bg-tokyo-green text-tokyo-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {mutation.isPending ? "Starting..." : "Start Scan"}
        </button>

        {mutation.isError && (
          <p className="text-tokyo-red text-sm text-center">
            {mutation.error.message}
          </p>
        )}
      </form>

      <p className="mt-8 text-xs text-tokyo-comment max-w-md text-center">
        This tool scans public repositories only. Deep scans perform live
        credential verification automatically.
      </p>
    </div>
  );
}
