import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useSSE(scanId: string | null) {
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!scanId) return;

    const es = new EventSource(`/api/scans/${scanId}/stream`);
    sourceRef.current = es;

    es.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["findings", scanId] });
      queryClient.invalidateQueries({ queryKey: ["hits", scanId] });
    };

    es.onerror = () => {
      es.close();
      // Fall back to polling — TanStack Query refetchInterval handles this
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [scanId, queryClient]);
}
