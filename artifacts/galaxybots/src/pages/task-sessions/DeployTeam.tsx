import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useAnalyzeTaskMutation,
  useCreateTaskSessionMutation,
  useFabricateBotMutation,
} from "@/hooks/use-task-sessions";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { getScenarioById } from "@/data/scenarios";
import {
  Loader2,
  Rocket,
  Users,
  Sparkles,
  Check,
  X,
  Baby,
  Brain,
  ArrowRight,
  Library,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MissionTemplatesModal } from "@/components/MissionTemplates";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MissionPlaybook {
  id: number;
  name: string;
  description: string;
  steps: Array<{ order: number; role: string; objective: string }>;
  isBuiltIn: boolean;
  category: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  strategy: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  growth: "text-green-400 border-green-500/30 bg-green-500/10",
  finance: "text-gold border-gold/30 bg-gold/10",
  operations: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  general: "text-primary border-primary/30 bg-primary/10",
};

interface ProposedBot {
  name: string;
  title: string;
  department: string;
  personality: string;
  responsibilities: string[];
}

interface MatchedBot {
  id: number;
  name: string;
  title: string;
  department: string;
  description: string;
  isAiGenerated: boolean;
}

export default function DeployTeam() {
  const { toast } = useToast();
  const { user, updateOnboarding, token } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [objective, setObjective] = useState("");
  const [proposal, setProposal] = useState<{
    objective: string;
    matchedBots: MatchedBot[];
    proposedBots: ProposedBot[];
    reasoning: string;
  } | null>(null);
  const [approvedNewBots, setApprovedNewBots] = useState<
    Map<number, { approved: boolean; botId?: number }>
  >(new Map());
  const [fabricatingIdx, setFabricatingIdx] = useState<number | null>(null);
  const [lastPrefillScenarioId, setLastPrefillScenarioId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateHintBots, setTemplateHintBots] = useState<string[]>([]);
  const [showPlaybooks, setShowPlaybooks] = useState(false);

  const analyzeMutation = useAnalyzeTaskMutation();
  const createSessionMutation = useCreateTaskSessionMutation();
  const fabricateMutation = useFabricateBotMutation();

  const { data: playbooks = [] } = useQuery<MissionPlaybook[]>({
    queryKey: ["playbooks"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/playbooks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleSelectPlaybook = (playbook: MissionPlaybook) => {
    const objective = playbook.steps.map((s, i) => `Step ${i + 1}: ${s.role} — ${s.objective}`).join("; ");
    setObjective(playbook.name + ": " + playbook.description);
    setProposal(null);
    setApprovedNewBots(new Map());
    setShowPlaybooks(false);
    analyzeMutation
      .mutateAsync({ data: { objective: playbook.name + ": " + playbook.description } })
      .then((result) => {
        setProposal(result as typeof proposal);
      })
      .catch(() => {
        toast({
          title: "Analysis Failed",
          description: "Could not analyze the playbook. Please try manually.",
          variant: "destructive",
        });
      });
    void objective;
  };

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const scenarioId = params.get("scenario");
    const showTemplates = params.get("templates");

    if (showTemplates === "true") {
      setTemplatesOpen(true);
    }

    if (scenarioId && scenarioId !== lastPrefillScenarioId) {
      const scenario = getScenarioById(scenarioId);
      if (scenario) {
        setObjective(scenario.missionObjective);
        setProposal(null);
        setApprovedNewBots(new Map());
        setLastPrefillScenarioId(scenarioId);
        analyzeMutation
          .mutateAsync({ data: { objective: scenario.missionObjective } })
          .then((result) => {
            setProposal(result as typeof proposal);
          })
          .catch(() => {
            toast({
              title: "Analysis Failed",
              description: "Could not auto-analyze the mission. Please try manually.",
              variant: "destructive",
            });
          });
      }
    }
  }, [searchString, lastPrefillScenarioId]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objective.trim() || analyzeMutation.isPending) return;

    setProposal(null);
    setApprovedNewBots(new Map());

    const result = await analyzeMutation.mutateAsync({
      data: { objective: objective.trim() },
    });
    const analysisResult = result as typeof proposal;
    setProposal(analysisResult);

    if (templateHintBots.length > 0 && analysisResult?.proposedBots) {
      const hintLower = templateHintBots.map((b) => b.toLowerCase());
      const preSelected = new Map<number, { approved: boolean; botId?: number }>();
      for (let idx = 0; idx < analysisResult.proposedBots.length; idx++) {
        const bot = analysisResult.proposedBots[idx];
        const botNameLower = bot.name.toLowerCase();
        const botTitleLower = (bot.title || "").toLowerCase();
        const isRecommended = hintLower.some(
          (hint) =>
            botNameLower.includes(hint) ||
            botTitleLower.includes(hint) ||
            hint.includes(botNameLower) ||
            hint.includes(botTitleLower)
        );
        if (isRecommended) {
          preSelected.set(idx, { approved: true });
        }
      }
      if (preSelected.size > 0) {
        setApprovedNewBots(preSelected);
        toast({
          title: "Recommended bots pre-selected",
          description: `${preSelected.size} template-recommended bot(s) pre-selected. Review and confirm your team.`,
        });
      }
    }
  };

  const handleTemplateLaunch = (templateObjective: string, recommendedBots: string[]) => {
    setObjective(templateObjective);
    setProposal(null);
    setApprovedNewBots(new Map());
    setTemplateHintBots(recommendedBots);
    toast({
      title: "Template loaded",
      description: recommendedBots.length > 0
        ? `Objective pre-filled. Recommended bots: ${recommendedBots.slice(0, 3).join(", ")}. Click Analyze to assemble your team.`
        : "Objective pre-filled. Click Analyze to assemble your team.",
    });
  };

  const handleApproveBot = async (idx: number, bot: ProposedBot) => {
    setFabricatingIdx(idx);
    try {
      const newBot = await fabricateMutation.mutateAsync({
        data: {
          name: bot.name,
          title: bot.title,
          department: bot.department,
          personality: bot.personality,
          responsibilities: bot.responsibilities,
          description: `AI-fabricated specialist: ${bot.title} in ${bot.department}`,
          category: bot.department,
        },
      });
      const updated = new Map(approvedNewBots);
      updated.set(idx, { approved: true, botId: (newBot as { id: number }).id });
      setApprovedNewBots(updated);
      toast({
        title: "Bot Fabricated",
        description: `${bot.name} has been created and added to the roster.`,
      });
    } catch {
      toast({
        title: "Fabrication Failed",
        description: "Could not create the new bot. Please try again.",
        variant: "destructive",
      });
    }
    setFabricatingIdx(null);
  };

  const handleRejectBot = (idx: number) => {
    const updated = new Map(approvedNewBots);
    updated.set(idx, { approved: false });
    setApprovedNewBots(updated);
  };

  const handleLaunch = async () => {
    if (!proposal) return;

    const botIds = [
      ...proposal.matchedBots.map((b) => b.id),
      ...[...approvedNewBots.entries()]
        .filter(([, v]) => v.approved && v.botId)
        .map(([, v]) => v.botId!),
    ];

    if (botIds.length === 0) {
      toast({
        title: "No team members",
        description: "You need at least one bot to launch a task room.",
        variant: "destructive",
      });
      return;
    }

    const session = await createSessionMutation.mutateAsync({
      data: { objective: proposal.objective, botIds },
    });

    toast({
      title: "Task Room Deployed",
      description: `Team of ${botIds.length} specialists assembled.`,
    });

    if (user?.onboarding && !user.onboarding.firstMission) {
      updateOnboarding({ firstMission: true }).catch(() => {});
    }

    navigate(`/task-rooms/${(session as { id: number }).id}`);
  };

  const allProposedDecided =
    proposal?.proposedBots.every((_, idx) => approvedNewBots.has(idx)) ?? true;

  return (
    <AppLayout>
      <div className="relative w-full min-h-[calc(100vh-5rem)] bg-background">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary flex items-center gap-3">
                <Rocket className="w-7 h-7 sm:w-8 sm:h-8" />
                Deploy Task Team
              </h1>
              <p className="text-muted-foreground mt-2 font-tech">
                Describe your business objective and Optima Prime will assemble
                the optimal cross-functional team.
              </p>
            </div>
            <Button
              variant="outline"
              className="font-tech text-sm flex-shrink-0 border-primary/30 hover:border-primary/60"
              onClick={() => setTemplatesOpen(true)}
            >
              <Library className="w-4 h-4 mr-2" />
              Browse Templates
            </Button>
          </div>

          <Card className="p-6 bg-black/40 border-primary/30 backdrop-blur-md mb-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-4">
                <div>
                  <h2 className="font-display font-bold text-primary text-lg tracking-wider">Optima Prime</h2>
                  <p className="text-xs text-primary/50 font-tech uppercase tracking-widest mt-0.5">Task-Force Intelligence Commander</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-tech font-bold text-primary/70 uppercase tracking-widest">Optima</p>
                    <p className="text-sm text-foreground/75 font-tech leading-relaxed">
                      From Latin <span className="italic text-primary/80">optimus</span> — the most favorable conditions; the best possible state achievable given the constraints. Optima represents the point at which every variable aligns for maximum outcome.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-tech font-bold text-primary/70 uppercase tracking-widest">Prime</p>
                    <p className="text-sm text-foreground/75 font-tech leading-relaxed">
                      From Latin <span className="italic text-primary/80">primus</span> — first in rank, order, and importance. Prime denotes supremacy: the highest grade, the foremost authority, the one that precedes all others.
                    </p>
                  </div>
                </div>
                <div className="border-t border-primary/10 pt-4">
                  <p className="text-xs font-tech font-bold text-primary/70 uppercase tracking-widest mb-1">Combined</p>
                  <p className="text-sm text-foreground/80 font-tech leading-relaxed">
                    <span className="text-primary font-bold">Optima Prime</span> is the supreme intelligence of optimal outcomes — the first-order system that reads any business objective, identifies every specialist role required, and assembles the ideal cross-functional team to execute it. Where others see complexity, Optima Prime sees composition. Every mission begins here.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-black/40 border-primary/20 backdrop-blur-md mb-6">
            <form onSubmit={handleAnalyze} className="flex gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-0">
                <Input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Describe your task... e.g. 'Implement and manage our cookie compliance program'"
                  className="bg-black/50 border-primary/30 text-primary placeholder:text-primary/30 font-tech"
                  disabled={analyzeMutation.isPending}
                />
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPlaybooks(true)}
                  className="font-tech tracking-wider border-primary/30 text-primary/70 hover:text-primary hover:border-primary/60"
                  disabled={analyzeMutation.isPending}
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Use Playbook
                </Button>
                <Button
                  type="submit"
                  disabled={!objective.trim() || analyzeMutation.isPending}
                  variant="glow"
                  className="font-tech tracking-wider"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Brain className="w-4 h-4 animate-pulse mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Analyze Task
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>

          {templateHintBots.length > 0 && !analyzeMutation.isPending && !proposal && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <Card className="p-4 bg-violet-500/5 border-violet-500/20">
                <p className="text-xs font-tech font-semibold text-violet-400/80 uppercase tracking-widest mb-2">
                  Template Recommended Bots
                </p>
                <div className="flex flex-wrap gap-1">
                  {templateHintBots.map((bot) => (
                    <Badge key={bot} variant="outline" className="text-xs border-violet-500/30 text-violet-300 font-tech">
                      {bot}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground font-tech mt-2">
                  Optima Prime will match or create these roles based on your objective.
                </p>
              </Card>
            </motion.div>
          )}

          <Dialog open={showPlaybooks} onOpenChange={setShowPlaybooks}>
            <DialogContent className="max-w-2xl bg-background border-primary/30">
              <DialogHeader>
                <DialogTitle className="font-display text-primary flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Mission Playbooks
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {playbooks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground font-tech text-sm">
                    No playbooks available.
                  </div>
                ) : (
                  playbooks.map((playbook) => {
                    const catStyle = CATEGORY_STYLES[playbook.category] ?? CATEGORY_STYLES.general;
                    return (
                      <Card
                        key={playbook.id}
                        className="p-4 bg-black/40 border-primary/20 hover:border-primary/40 transition-colors cursor-pointer"
                        onClick={() => handleSelectPlaybook(playbook)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h3 className="font-tech font-bold text-sm text-foreground">{playbook.name}</h3>
                              <Badge variant="outline" className={`text-[10px] ${catStyle}`}>
                                {playbook.category.toUpperCase()}
                              </Badge>
                              {playbook.isBuiltIn && (
                                <Badge variant="outline" className="text-[10px] text-primary/60 border-primary/20">
                                  BUILT-IN
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{playbook.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {playbook.steps.map((step, i) => (
                                <div key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <span className="font-tech text-primary/60">{step.role}</span>
                                  {i < playbook.steps.length - 1 && <ChevronRight className="w-2.5 h-2.5" />}
                                </div>
                              ))}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="font-tech text-xs flex-shrink-0 border-primary/30 text-primary hover:bg-primary/10">
                            Use <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>

          {analyzeMutation.isPending && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-4"
            >
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-primary/70 font-tech animate-pulse">
                Optima Prime is analyzing your task...
              </p>
            </motion.div>
          )}

          <AnimatePresence>
            {proposal && !analyzeMutation.isPending && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <Card className="p-5 bg-primary/5 border-primary/20">
                  <div className="flex items-start gap-3">
                    <Brain className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-tech font-bold text-primary text-sm mb-1">
                        Optima Prime Analysis
                      </h3>
                      <p className="text-sm text-foreground/80">
                        {proposal.reasoning}
                      </p>
                    </div>
                  </div>
                </Card>

                {proposal.matchedBots.length > 0 && (
                  <div>
                    <h2 className="text-lg font-tech font-bold text-foreground mb-3 flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      Confirmed Team ({proposal.matchedBots.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {proposal.matchedBots.map((bot) => (
                        <Card
                          key={bot.id}
                          className="p-4 bg-black/30 border-primary/30 flex items-start gap-3"
                        >
                          <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
                            <Check className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-tech font-bold text-sm text-foreground truncate">
                              {bot.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {bot.title}
                            </p>
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              {bot.department}
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {proposal.proposedBots.length > 0 && (
                  <div>
                    <h2 className="text-lg font-tech font-bold text-foreground mb-3 flex items-center gap-2">
                      <Baby className="w-5 h-5 text-yellow-400" />
                      Proposed New Bots — CEO Approval Required
                    </h2>
                    <div className="grid grid-cols-1 gap-3">
                      {proposal.proposedBots.map((bot, idx) => {
                        const decision = approvedNewBots.get(idx);
                        const isFabricating = fabricatingIdx === idx;

                        return (
                          <Card
                            key={idx}
                            className={`p-5 border transition-colors ${
                              decision?.approved
                                ? "bg-primary/10 border-primary/40"
                                : decision && !decision.approved
                                  ? "bg-destructive/5 border-destructive/20 opacity-50"
                                  : "bg-yellow-500/5 border-yellow-500/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    variant="outline"
                                    className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px]"
                                  >
                                    GIVE BIRTH
                                  </Badge>
                                  {decision?.approved && (
                                    <Badge className="bg-primary/20 text-primary text-[10px]">
                                      CREATED
                                    </Badge>
                                  )}
                                </div>
                                <p className="font-tech font-bold text-foreground">
                                  {bot.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {bot.title} — {bot.department}
                                </p>
                                <p className="text-xs text-foreground/60 mt-1 italic">
                                  {bot.personality}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {bot.responsibilities.map((r, i) => (
                                    <Badge
                                      key={i}
                                      variant="secondary"
                                      className="text-[10px]"
                                    >
                                      {r}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              {!decision && (
                                <div className="flex gap-2 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="glow"
                                    onClick={() => handleApproveBot(idx, bot)}
                                    disabled={isFabricating}
                                    className="font-tech text-xs"
                                  >
                                    {isFabricating ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <>
                                        <Check className="w-3 h-3 mr-1" />
                                        Approve
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRejectBot(idx)}
                                    className="font-tech text-xs"
                                  >
                                    <X className="w-3 h-3 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleLaunch}
                    disabled={
                      !allProposedDecided || createSessionMutation.isPending
                    }
                    variant="glow"
                    size="lg"
                    className="font-tech tracking-widest text-base"
                  >
                    {createSessionMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="w-5 h-5 mr-2" />
                    )}
                    LAUNCH TASK ROOM
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <MissionTemplatesModal
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onLaunch={handleTemplateLaunch}
      />
    </AppLayout>
  );
}
