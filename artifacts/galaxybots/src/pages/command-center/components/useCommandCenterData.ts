import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { BASE, type Approval, type Alert, type CompanyCard, type UnifiedActivityEvent, type SlaOverviewData } from "./types";

export function useCommandCenterData() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const activity = useQuery<{ items: UnifiedActivityEvent[]; total: number }>({
    queryKey: ["command-center", "activity-unified"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/activity?limit=30`, { headers });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const approvals = useQuery<Approval[]>({
    queryKey: ["command-center", "approvals"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/command-center/approvals?status=pending`, { headers });
      if (!res.ok) throw new Error("Failed to load approvals");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const alerts = useQuery<Alert[]>({
    queryKey: ["command-center", "alerts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/command-center/alerts?limit=20`, { headers });
      if (!res.ok) throw new Error("Failed to load alerts");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const companies = useQuery<CompanyCard[]>({
    queryKey: ["command-center", "companies"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/command-center/companies`, { headers });
      if (!res.ok) throw new Error("Failed to load companies");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const slaOverview = useQuery<SlaOverviewData>({
    queryKey: ["command-center", "sla-overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/sla-overview`, { headers });
      if (!res.ok) throw new Error("Failed to load SLA overview");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const governanceMode = useQuery<{ governanceMode: string }>({
    queryKey: ["governance", "mode"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/governance/mode`, { headers });
      if (!res.ok) throw new Error("Failed to load governance mode");
      return res.json();
    },
  });

  const autonomyScore = useQuery<{ score: number; totalTasks: number; autonomousTasks: number }>({
    queryKey: ["governance", "autonomy-score"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/governance/autonomy-score`, { headers });
      if (!res.ok) return { score: 100, totalTasks: 0, autonomousTasks: 0 };
      return res.json();
    },
    refetchInterval: 60000,
  });

  const opportunitySignals = useQuery<Array<{
    id: number;
    signalType: string;
    title: string;
    description: string;
    suggestedAction: string;
    probabilityOfSuccess: number | null;
    status: string;
    detectedAt: string;
  }>>({
    queryKey: ["command-center", "opportunity-signals"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/opportunity-signals?status=pending`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  return { activity, approvals, alerts, companies, slaOverview, governanceMode, autonomyScore, opportunitySignals };
}
