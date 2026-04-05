import { useQuery } from "@tanstack/react-query";
import { BASE, type SpendData, type TokenData, type ToolData, type OverviewData, type PipelineData, type SchedulerData } from "./types";

export function useAnalyticsData() {
  const overview = useQuery<OverviewData>({
    queryKey: ["analytics", "overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/overview`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const spend = useQuery<SpendData>({
    queryKey: ["analytics", "spend"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/spend`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const tokens = useQuery<TokenData>({
    queryKey: ["analytics", "tokens"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/tokens`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const tools = useQuery<ToolData>({
    queryKey: ["analytics", "tools"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/tools`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const pipelines = useQuery<PipelineData>({
    queryKey: ["analytics", "pipelines"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/pipelines`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const scheduler = useQuery<SchedulerData>({
    queryKey: ["analytics", "scheduler"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/scheduler`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return { overview, spend, tokens, tools, pipelines, scheduler };
}
