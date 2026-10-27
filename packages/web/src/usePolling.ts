import { useCallback, useEffect, useRef, useState } from "react";

/** One request at a time; pausing cancels results and timers, retaining the last good data. */
export function usePolling<T>(load: () => Promise<T>, live: boolean, interval: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const attempted = useRef(false);
  const lastRevision = useRef(-1);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await load();
        if (!cancelled) { setData(next); setError(null); setUpdatedAt(new Date()); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      }
      if (!cancelled) { attempted.current = true; lastRevision.current = revision; }
      if (!cancelled && live) timer = setTimeout(poll, interval);
    };
    if (live || !attempted.current || lastRevision.current !== revision) void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [load, live, interval, revision]);
  return { data, error, updatedAt, refresh };
}
