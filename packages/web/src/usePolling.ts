import { useCallback, useEffect, useRef, useState } from "react";
import { pollingCache } from "./pollingCache";

/** One request at a time. Recent keyed pages render immediately, then revalidate. */
export function usePolling<T>(load: () => Promise<T>, live: boolean, interval: number, cacheKey?: string) {
  const [state, setState] = useState(() => ({ key: cacheKey, load, snapshot: pollingCache.get<T>(cacheKey), error: null as string | null }));
  const [revision, setRevision] = useState(0);
  const attempted = useRef(false);
  const lastLoad = useRef<(() => Promise<T>) | null>(null);
  const lastKey = useRef<string | undefined>(undefined);
  const lastRevision = useRef(-1);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  // Never render a previous address/filter for even one frame after a key change.
  const matches = state.key === cacheKey && (cacheKey !== undefined || state.load === load);
  const snapshot = matches ? state.snapshot : pollingCache.get<T>(cacheKey);
  useEffect(() => {
    let cancelled = false;
    const changed = lastLoad.current !== load || lastKey.current !== cacheKey;
    lastLoad.current = load; lastKey.current = cacheKey;
    if (changed) setState({ key: cacheKey, load, snapshot: pollingCache.get<T>(cacheKey), error: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await load();
        if (!cancelled) {
          const snapshot = { data: next, updatedAt: new Date() };
          pollingCache.set(cacheKey, snapshot);
          setState({ key: cacheKey, load, snapshot, error: null });
        }
      } catch (e) {
        if (!cancelled) {
          // Keep an already visible snapshot with an error, but don't reuse it on later visits.
          if (cacheKey) pollingCache.delete(cacheKey);
          setState(previous => ({ ...previous, error: e instanceof Error ? e.message : "Request failed" }));
        }
      }
      if (!cancelled) { attempted.current = true; lastRevision.current = revision; }
      if (!cancelled && live) timer = setTimeout(poll, interval);
    };
    if (live || changed || !attempted.current || lastRevision.current !== revision) void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [load, live, interval, revision, cacheKey]);
  return { data: snapshot?.data ?? null, error: matches ? state.error : null, updatedAt: snapshot?.updatedAt ?? null, refresh };
}
