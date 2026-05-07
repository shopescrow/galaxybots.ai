import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  SCENARIOS,
  SCENARIO_CLIENTS,
  SCENARIO_CATEGORIES,
  type Scenario,
  type ScenarioCategory,
} from "@/data/scenarios";
import {
  Crosshair,
  Building,
  Rocket,
  Filter,
  Zap,
  Shield,
  Target,
  Store,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PublishModal } from "@/components/marketplace/PublishModal";

const DIFFICULTY_STYLES: Record<string, string> = {
  Tactical: "text-green-400 border-green-500/30 bg-green-500/10",
  Strategic: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  Critical: "text-red-400 border-red-500/30 bg-red-500/10",
};

const DIFFICULTY_ICONS: Record<string, typeof Zap> = {
  Tactical: Zap,
  Strategic: Target,
  Critical: Shield,
};

export default function Scenarios() {
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const [, navigate] = useLocation();
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<ScenarioCategory | "all">("all");
  const [publishScenario, setPublishScenario] = useState<Scenario | null>(null);

  const filtered = SCENARIOS.filter((s) => {
    if (clientFilter !== "all" && s.clientSlug !== clientFilter) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    return true;
  });

  const handleLaunchMission = (scenario: Scenario) => {
    navigate(`/deploy-team?scenario=${encodeURIComponent(scenario.id)}`);
  };

  return (
    <AppLayout>
      <div className="relative w-full min-h-[calc(100vh-5rem)] bg-background">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary flex items-center gap-3">
              <Crosshair className="w-7 h-7 sm:w-8 sm:h-8" />
              Scenario Library
            </h1>
            <p className="text-muted-foreground mt-2 font-tech">
              Real-world business missions executed by live bot teams on behalf of real companies.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="flex gap-1 p-1 rounded-xl bg-card border border-border/40 w-fit overflow-x-auto">
              {[
                { key: "all", label: "All Companies" },
                ...SCENARIO_CLIENTS.map((c) => ({ key: c.slug, label: c.name })),
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setClientFilter(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-tech transition-all duration-200 min-h-[44px] whitespace-nowrap ${
                    clientFilter === tab.key
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.key !== "all" && <Building className="w-3.5 h-3.5" />}
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex gap-1">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-tech transition-all whitespace-nowrap ${
                    categoryFilter === "all"
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  }`}
                >
                  All
                </button>
                {SCENARIO_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-tech transition-all whitespace-nowrap ${
                      categoryFilter === cat
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-12 bg-black/30 border-primary/20 text-center">
              <Crosshair className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <h3 className="text-lg font-tech font-bold text-foreground mb-2">
                No Missions Found
              </h3>
              <p className="text-sm text-muted-foreground">
                Adjust your filters to see available missions.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.map((scenario, idx) => {
                const DiffIcon = DIFFICULTY_ICONS[scenario.difficulty] || Zap;
                return (
                  <motion.div
                    key={scenario.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <Card className="p-5 bg-black/30 border-primary/20 hover:border-primary/40 transition-all h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] text-cyan border-cyan/30 bg-cyan/10">
                            {scenario.companyName}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {scenario.category}
                          </Badge>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] flex items-center gap-1 flex-shrink-0 ${DIFFICULTY_STYLES[scenario.difficulty]}`}
                        >
                          <DiffIcon className="w-3 h-3" />
                          {scenario.difficulty}
                        </Badge>
                      </div>

                      <h3 className="font-tech font-bold text-foreground text-lg mb-2">
                        {scenario.title}
                      </h3>

                      <p className="text-sm text-muted-foreground mb-4 flex-1">
                        {scenario.situation}
                      </p>

                      <div className="mb-4">
                        <p className="text-[10px] font-tech text-primary uppercase tracking-wider mb-2">
                          Planned Actions
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {scenario.actions.map((action, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="glow"
                          className="flex-1 font-tech tracking-wider"
                          onClick={() => handleLaunchMission(scenario)}
                        >
                          <Rocket className="w-4 h-4 mr-2" />
                          Launch Mission
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title="Publish to Marketplace"
                          onClick={(e) => { e.stopPropagation(); setPublishScenario(scenario); }}
                        >
                          <Store className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {publishScenario && (
        <PublishModal
          open={!!publishScenario}
          onOpenChange={(open) => { if (!open) setPublishScenario(null); }}
          type="scenario"
          sourceData={{
            objective: publishScenario.missionObjective,
            situation: publishScenario.situation,
            actions: publishScenario.actions,
            category: publishScenario.category,
            difficulty: publishScenario.difficulty,
            recommendedBotTitles: [],
          }}
          defaultTitle={publishScenario.title}
          defaultDescription={publishScenario.situation}
        />
      )}
    </AppLayout>
  );
}
