/**
 * Single polling loop behind every page.
 *
 * The system state is derived from what the API reports, with one addition the
 * server cannot make: if the request itself fails we are in `dberror` — the
 * API can't tell us its database is unreachable when we never reached the API.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConfig,
  getEndpoints,
  getNetwork,
  type Config,
  type EndpointList,
  type Network,
  type SystemState,
} from "./api";

/** The fast loop matches the header cadence. */
const REFRESH_MS = 4_000;
const SLOW_REFRESH_MS = 30_000;
/** The indexer writes sync state every few blocks; a minute of silence means it stopped. */
const STALL_MS = 60_000;
/** Behind by more than this many blocks, the explorer reports catching up. */
const BACKFILL_LAG = 100;

export type Dashboard = {
  net: Network | null;
  config: Config | null;
  endpoints: EndpointList | null;
  /** Effective state. */
  state: SystemState;
  error: string | null;
  lastUpdated: Date | null;
  /** Seconds since the last successful poll — drives the "Updated Ns ago". */
  agoSeconds: number;
  refresh: () => void;
};

export function useDashboard(opts: { live: boolean }): Dashboard {
  const { live } = opts;

  const [net, setNet] = useState<Network | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointList | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [agoSeconds, setAgoSeconds] = useState(0);
  const lastPoll = useRef<number>(0);

  /** Run `fn` now and every `ms` while live; cancels cleanly on change. */
  const every = useCallback(
    (ms: number, fn: () => Promise<void>, deps: unknown[]) => {
      useEffect(() => {
        if (!live)
          return () => {
            /* paused: keep the last good data on screen */
          };
        void fn();
        const id = setInterval(() => void fn(), ms);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [live, ms, ...deps]);
    },
    [live],
  );

  const poll = useCallback(async () => {
    try {
      setNet(await getNetwork());
      setError(null);
      lastPoll.current = Date.now();
      setLastUpdated(new Date());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  every(REFRESH_MS, poll, []);

  // Slow loop: the RPC directory is probed live; everything else is static.
  every(
    SLOW_REFRESH_MS,
    async () => {
      const e = await getEndpoints().catch(() => undefined);
      if (e) setEndpoints(e);
    },
    [],
  );

  // Config is static for the process lifetime.
  useEffect(() => {
    let cancelled = false;
    void getConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // "Updated Ns ago" ticker.
  useEffect(() => {
    const id = setInterval(() => {
      if (lastPoll.current) setAgoSeconds(Math.round((Date.now() - lastPoll.current) / 1000));
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  const state: SystemState = (() => {
    if (error && !net) return "dberror";
    if (!net) return "loading";
    if (net.indexer_updated_at && Date.now() - new Date(net.indexer_updated_at).getTime() > STALL_MS) return "stopped";
    if (net.backfill_target !== null && net.indexed_head !== null && net.backfill_target < net.indexed_head - BACKFILL_LAG)
      return "backfill";
    return "normal";
  })();

  const refresh = useCallback(() => void poll(), [poll]);

  return { net, config, endpoints, state, error, lastUpdated, agoSeconds, refresh };
}
