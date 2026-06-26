import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Loader2, DollarSign, Activity, Zap, Clock, BarChart3 } from "lucide-react";
import { StatCard } from "./components/StatCard";
import { SpendOverTimeChart } from "./components/SpendOverTimeChart";
import { TokensByModelChart } from "./components/TokensByModelChart";
import { SpendByModelChart } from "./components/SpendByModelChart";
import { SpendByTierChart } from "./components/SpendByTierChart";
import { PipelineHealthChart } from "./components/PipelineHealthChart";
import { SchedulerHealthPanel } from "./components/SchedulerHealthPanel";
import { ToolCallFrequencyChart } from "./components/ToolCallFrequencyChart";
import { ModelPerformanceTable } from "./components/ModelPerformanceTable";
import { DemoMetricsPanel } from "./components/DemoMetricsPanel";
import { CostCapPanel } from "./components/CostCapPanel";
import { ApiKeysPanel } from "./components/ApiKeysPanel";
import { ClientHealthAnalyticsPanel } from "./components/ClientHealthAnalyticsPanel";
import { VoiceAnalyticsPanel } from "./components/VoiceAnalyticsPanel";
import { DataExportPanel } from "./components/DataExportPanel";
import { BeliefHealthPanel } from "./components/BeliefHealthPanel";
import { ScalingMarginPanel } from "./components/ScalingMarginPanel";
import { useAnalyticsData } from "./components/useAnalyticsData";

export default function AnalyticsDashboard() {
  const { overview, spend, tokens, tools, pipelines, scheduler } = useAnalyticsData();

  if (overview.isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <BarChart3 className="w-3 h-3 mr-1" />
                Analytics
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Platform <span className="text-gradient">Analytics</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              LLM costs, token usage, tool activity, and operational health
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={DollarSign}
            label="Total Spend"
            value={`$${(overview.data?.totalSpend ?? 0).toFixed(4)}`}
            subtitle={`$${(overview.data?.monthlySpend ?? 0).toFixed(4)} this month`}
          />
          <StatCard
            icon={Activity}
            label="LLM Calls"
            value={(overview.data?.totalCalls ?? 0).toLocaleString()}
            subtitle={`${(overview.data?.avgLatencyMs ?? 0)}ms avg latency`}
          />
          <StatCard
            icon={Zap}
            label="Total Tokens"
            value={(overview.data?.totalTokens ?? 0).toLocaleString()}
            subtitle="Prompt + completion"
          />
          <StatCard
            icon={Clock}
            label="Tool Executions"
            value={(overview.data?.totalToolCalls ?? 0).toLocaleString()}
            subtitle="Total tool calls"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ErrorBoundary><SpendOverTimeChart spend={spend.data} /></ErrorBoundary>
          <ErrorBoundary><TokensByModelChart tokens={tokens.data} /></ErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <ErrorBoundary><SpendByModelChart spend={spend.data} /></ErrorBoundary>
          <ErrorBoundary><SpendByTierChart /></ErrorBoundary>
          <ErrorBoundary><PipelineHealthChart pipelines={pipelines.data} /></ErrorBoundary>
          <ErrorBoundary><SchedulerHealthPanel scheduler={scheduler.data} /></ErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ErrorBoundary><ToolCallFrequencyChart tools={tools.data} /></ErrorBoundary>
        </div>

        <ErrorBoundary><ModelPerformanceTable spend={spend.data} /></ErrorBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ErrorBoundary><ClientHealthAnalyticsPanel /></ErrorBoundary>
          <ErrorBoundary><VoiceAnalyticsPanel /></ErrorBoundary>
        </div>

        <div className="grid grid-cols-1 mb-8">
          <ErrorBoundary><BeliefHealthPanel /></ErrorBoundary>
        </div>

        <div className="grid grid-cols-1 mb-8">
          <ErrorBoundary><ScalingMarginPanel /></ErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <ErrorBoundary><DemoMetricsPanel /></ErrorBoundary>
          <ErrorBoundary><CostCapPanel /></ErrorBoundary>
          <ErrorBoundary><ApiKeysPanel /></ErrorBoundary>
          <ErrorBoundary><DataExportPanel /></ErrorBoundary>
        </div>
      </div>
    </AppLayout>
  );
}
