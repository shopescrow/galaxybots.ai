import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useParams, Link } from "wouter";
import { useBot } from "@/hooks/use-bots";
import { useState } from "react";
import { ArrowLeft, MessageSquare, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PANELS, DEMO_BADGE } from "./components/constants";
import type { PanelId } from "./components/constants";
import { ARRMRRPanel } from "./components/ARRMRRPanel";
import { CohortPanel } from "./components/CohortPanel";
import { UnitEconomicsPanel } from "./components/UnitEconomicsPanel";
import { CashFlowPanel } from "./components/CashFlowPanel";
import { ChurnPanel } from "./components/ChurnPanel";
import { PricingSimPanel } from "./components/PricingSimPanel";
import { BenchmarkingPanel } from "./components/BenchmarkingPanel";
import { CapitalEfficiencyPanel } from "./components/CapitalEfficiencyPanel";
import { DTIPanel } from "./components/DTIPanel";
import { WhatIfPanel } from "./components/WhatIfPanel";
import { BoardReportPanel } from "./components/BoardReportPanel";
import { ChatSlideOver } from "./components/ChatSlideOver";

export default function CFODashboard() {
  const params = useParams<{ id: string }>();
  const botId = Number(params.id);
  const { data: bot } = useBot(botId);

  const [activePanel, setActivePanel] = useState<PanelId>("arr-mrr");
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeInfo = PANELS.find((p) => p.id === activePanel)!;

  const renderPanel = () => {
    let panel;
    switch (activePanel) {
      case "arr-mrr": panel = <ARRMRRPanel />; break;
      case "cohort": panel = <CohortPanel />; break;
      case "unit-economics": panel = <UnitEconomicsPanel />; break;
      case "cash-flow": panel = <CashFlowPanel />; break;
      case "churn": panel = <ChurnPanel />; break;
      case "pricing-sim": panel = <PricingSimPanel />; break;
      case "benchmarking": panel = <BenchmarkingPanel />; break;
      case "capital-efficiency": panel = <CapitalEfficiencyPanel />; break;
      case "dti": panel = <DTIPanel />; break;
      case "what-if": panel = <WhatIfPanel />; break;
      case "board-report": panel = <BoardReportPanel />; break;
      default: panel = null;
    }
    return <ErrorBoundary>{panel}</ErrorBoundary>;
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-4rem)] overflow-hidden relative">
        <aside className={cn(
          "shrink-0 w-64 border-r border-border/50 bg-card/50 flex-col overflow-y-auto transition-transform duration-200 z-30",
          "hidden lg:flex",
        )}>
          <div className="p-4 border-b border-border/50">
            <Link href={`/bots/${botId}`}>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 mb-3 -ml-1">
                <ArrowLeft className="w-4 h-4" />
                Back to Bot
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{bot?.name ?? "CFO Sentinel Marcus"}</p>
                <p className="text-[10px] text-muted-foreground font-tech">{bot?.title ?? "Finance Director"}</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-2">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              return (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left mb-0.5",
                    activePanel === panel.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {panel.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border/50">
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setChatOpen(true)}>
              <MessageSquare className="w-4 h-4" />
              Chat with Marcus
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/30 shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <activeInfo.icon className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-base">{activeInfo.label}</h1>
                  {DEMO_BADGE}
                </div>
                <p className="text-[11px] text-muted-foreground font-tech hidden sm:block">CFO Financial Command Center</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30 hidden sm:flex">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                Live Demo
              </Badge>
              <Button size="sm" className="gap-2" onClick={() => setChatOpen(true)}>
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Ask Marcus</span>
              </Button>
            </div>
          </header>

          {sidebarOpen && (
            <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)}>
              <div className="w-64 h-full bg-card border-r border-border/50 p-2" onClick={(e) => e.stopPropagation()}>
                {PANELS.map((panel) => {
                  const Icon = panel.icon;
                  return (
                    <button
                      key={panel.id}
                      onClick={() => { setActivePanel(panel.id); setSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left mb-0.5",
                        activePanel === panel.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {panel.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {renderPanel()}
          </main>
        </div>

        {chatOpen && bot && (
          <>
            <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" onClick={() => setChatOpen(false)} />
            <ChatSlideOver botId={botId} onClose={() => setChatOpen(false)} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
