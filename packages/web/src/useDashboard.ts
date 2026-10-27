import { useCallback, useEffect, useState } from "react";
import { getConfig, getEndpoints, getNetwork, type Config, type EndpointList, type Network, type SystemState } from "./api";
import { dashboardState } from "./dashboardState";
import { usePolling } from "./usePolling";

export type Dashboard = {
  net: Network | null; config: Config | null; endpoints: EndpointList | null;
  state: SystemState; error: string | null; lastUpdated: Date | null;
  agoSeconds: number; refresh: () => void;
};

export function useDashboard({ live }: { live: boolean }): Dashboard {
  const network = usePolling(getNetwork, live, 4_000);
  const endpoints = usePolling(getEndpoints, live, 30_000);
  const config = usePolling(getConfig, false, 0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(id); }, []);
  const refresh = useCallback(() => { network.refresh(); endpoints.refresh(); config.refresh(); }, [network.refresh, endpoints.refresh, config.refresh]);
  return {
    net: network.data, config: config.data, endpoints: endpoints.data,
    state: dashboardState(network.data, network.error, live ? now : network.updatedAt?.getTime() ?? now),
    error: network.error, lastUpdated: network.updatedAt,
    agoSeconds: network.updatedAt ? Math.max(0, Math.round((now - network.updatedAt.getTime()) / 1000)) : 0,
    refresh,
  };
}
