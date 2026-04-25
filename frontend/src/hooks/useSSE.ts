import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScanStore } from "../stores/scanStore";

const FINDINGS_INVALIDATE_INTERVAL = 5000;

export function useSSE(scanId: string | null) {
  const queryClient = useQueryClient();
  const addLog = useScanStore((s) => s.addLog);
  const clearLogs = useScanStore((s) => s.clearLogs);
  const lastFindingsInvalidate = useRef(0);
  const prevScanId = useRef<string | null>(null);

  useEffect(() => {
    if (!scanId) return;

    if (prevScanId.current !== scanId) {
      clearLogs();
      addLog({ level: "info", prefix: "INIT", message: "connecting to worker stream..." });
      prevScanId.current = scanId;
    }

    const es = new EventSource(`/api/scans/${scanId}/stream`);

    es.onmessage = (event: MessageEvent) => {
      // Scan status changes on every event — always invalidate
      queryClient.invalidateQueries({ queryKey: ["scan", scanId] });

      // Findings/hits are large payloads — throttle to once per 5s
      const now = Date.now();
      if (now - lastFindingsInvalidate.current >= FINDINGS_INVALIDATE_INTERVAL) {
        queryClient.invalidateQueries({ queryKey: ["findings", scanId] });
        queryClient.invalidateQueries({ queryKey: ["hits", scanId] });
        lastFindingsInvalidate.current = now;
      }

      try {
        const data = JSON.parse(event.data as string) as Record<string, string>;
        switch (data.event) {
          case "repo_started":
            addLog({
              level: "info",
              prefix: "CLONE",
              message: `git clone --mirror https://github.com/${data.repo}.git`,
            });
            addLog({
              level: "info",
              prefix: "SCAN",
              message: `trufflehog git --json --no-update file://$(pwd)/${data.repo?.replace("/", "_")}`,
            });
            break;
          case "finding":
            addLog({
              level: "warn",
              prefix: "FIND",
              message: `${data.type ?? "SECRET"} → ${data.repo}`,
            });
            break;
          case "repo_complete":
            addLog({
              level: "success",
              prefix: "DONE",
              message: `${data.repo} — clone purged`,
            });
            break;
          case "complete":
            // Flush findings immediately on scan completion
            queryClient.invalidateQueries({ queryKey: ["findings", scanId] });
            queryClient.invalidateQueries({ queryKey: ["hits", scanId] });
            lastFindingsInvalidate.current = Date.now();
            addLog({
              level: "success",
              prefix: "DONE",
              message:
                data.scan_type === "quick"
                  ? "quick scan complete — search hits indexed"
                  : "all repositories processed — scan complete",
            });
            break;
          case "failed":
            addLog({
              level: "error",
              prefix: "FAIL",
              message: data.error ?? "worker reported a fatal error",
            });
            break;
          default:
            break;
        }
      } catch {
        // Keepalive comments or malformed data — silently ignore
      }
    };

    es.onerror = () => {
      addLog({
        level: "warn",
        prefix: "WARN",
        message: "stream disconnected — polling every 5s",
      });
      es.close();
    };

    return () => {
      es.close();
    };
  }, [scanId, queryClient, addLog, clearLogs]);
}
