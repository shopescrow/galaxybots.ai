import { useState, useEffect } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { BingoLingoPanel } from "./BingoLingoPanel";
import { PirateMonsterOnboardingCard } from "./PirateMonsterOnboardingCard";
import { PirateMonsterMcpPanel } from "./PirateMonsterMcpPanel";
import { PirateMonsterPanel } from "./PirateMonsterPanel";
import { KiloProCard } from "./KiloProCard";
import { PirateMonsterProspectorCard } from "./PirateMonsterProspectorCard";
import { OllamaAdminCard } from "./OllamaAdminCard";
import { API_BASE, type AuditEvent, type ProspectorStats } from "./types";

export function PlatformToolsTab() {
  const [auditStats, setAuditStats] = useState<{ lastEvent: AuditEvent | null, count: number }>({ lastEvent: null, count: 0 });
  const [pmStats, setPmStats] = useState<ProspectorStats>({ dispatched: 0, received: 0, lastWebhook: null, avgConfidence: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [auditRes, pmRes] = await Promise.all([
          fetch(`${API_BASE}/audit?limit=1`),
          fetch(`${API_BASE}/prospecting/stats`)
        ]);

        if (auditRes.ok) {
          const logs = await auditRes.json();
          setAuditStats({ lastEvent: logs[0] || null, count: logs.length });
        }

        if (pmRes.ok) {
          const stats = await pmRes.json();
          setPmStats({
            dispatched: stats.totalJobs || 0,
            received: stats.totalProspects || 0,
            lastWebhook: stats.patterns?.[0]?.updatedAt || null,
            avgConfidence: parseFloat(stats.avgConfidence || "0")
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <ErrorBoundary><OllamaAdminCard /></ErrorBoundary>
      <ErrorBoundary><BingoLingoPanel /></ErrorBoundary>
      <ErrorBoundary><PirateMonsterOnboardingCard /></ErrorBoundary>
      <ErrorBoundary><PirateMonsterMcpPanel /></ErrorBoundary>
      <ErrorBoundary><PirateMonsterPanel /></ErrorBoundary>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ErrorBoundary><KiloProCard auditStats={auditStats} /></ErrorBoundary>
        <ErrorBoundary><PirateMonsterProspectorCard pmStats={pmStats} /></ErrorBoundary>
      </div>
    </div>
  );
}
