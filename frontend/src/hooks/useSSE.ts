import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScanStore } from "../stores/scanStore";
import { api } from "../lib/api";

const FINDINGS_INVALIDATE_INTERVAL = 5000;

export function useSSE(scanId: string | null) {
  const queryClient = useQueryClient();
  const addLog = useScanStore((s) => s.addLog);
  const clearLogs = useScanStore((s) => s.clearLogs);
  const setConnectionStatus = useScanStore((s) => s.setConnectionStatus);
  const lastFindingsInvalidate = useRef(0);
  const prevScanId = useRef<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!scanId) return;

    if (prevScanId.current !== scanId) {
      clearLogs();
      addLog({ level: "info", prefix: "INIT", message: "connecting to worker stream..." });
      prevScanId.current = scanId;
    }

    const flushAndFinish = (message: string, level: "success" | "warn" = "success") => {
      queryClient.invalidateQueries({ queryKey: ["findings", scanId] });
      queryClient.invalidateQueries({ queryKey: ["hits", scanId] });
      lastFindingsInvalidate.current = Date.now();
      addLog({ level, prefix: "DONE", message });
      setConnectionStatus("disconnected");
    };

    const es = new EventSource(`/api/scans/${scanId}/stream`);

    es.onopen = () => {
      setConnectionStatus("live");
    };

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
          case "completed":
            flushAndFinish(
              data.scan_type === "quick"
                ? "quick scan complete — search hits indexed"
                : "all repositories processed — scan complete"
            );
            break;
          case "repo_timeout":
            addLog({
              level: "warn",
              prefix: "SKIP",
              message: `${data.repo} — timed out${data.reason ? `: ${data.reason}` : ""}`,
            });
            break;
          case "repo_skipped":
            addLog({
              level: "warn",
              prefix: "SKIP",
              message: `${data.repo} — skipped${data.reason ? `: ${data.reason}` : ""}`,
            });
            break;
          case "warning":
            addLog({
              level: "warn",
              prefix: "WARN",
              message: data.message ?? data.reason ?? "worker warning",
            });
            break;
          case "failed":
            addLog({
              level: "error",
              prefix: "FAIL",
              message: data.error ?? "worker reported a fatal error",
            });
            setConnectionStatus("disconnected");
            break;
          default:
            break;
        }
      } catch {
        // Keepalive comments or malformed data — silently ignore
      }
    };

    es.onerror = () => {
      es.close();
      setConnectionStatus("polling");
      addLog({
        level: "warn",
        prefix: "WARN",
        message: "stream disconnected — polling every 5s",
      });

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const scan = await api.getScan(scanId);
          queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
          if (["completed", "failed", "partial"].includes(scan.status)) {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            flushAndFinish(
              `scan ${scan.status} — poll complete`,
              scan.status === "completed" ? "success" : "warn"
            );
          }
        } catch {
          // Network still down — keep polling silently
        }
      }, 5000);
    };

    return () => {
      es.close();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [scanId, queryClient, addLog, clearLogs, setConnectionStatus]);
}
