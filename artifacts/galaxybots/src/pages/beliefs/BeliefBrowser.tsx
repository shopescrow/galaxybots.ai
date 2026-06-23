import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  TrendingDown,
  BookOpen,
  Loader2,
  ChevronRight,
  Archive,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api/v1${path}`; }

interface BotBelief {
  id: number;
  botId: number;
  clientId: number | null;
  beliefText: string;
  confidence: number;
  evidenceCount: number;
  lastConfirmedAt: string;
  contradictedById: number | null;
  category: string;
  halfLifeDays: number;
  immutable: boolean;
  archivedAt: string | null;
  createdAt: string;
}

interface EpisodicSummary {
  id: number;
  botId: number;
  periodStart: string;
  periodEnd: string;
  narrative: string;
  turningPoints: string[];
  decisions: string[];
  outcomes: string[];
  forwardImplications: string[];
  anchorEvents: Array<{ timestamp: string; event: string; significance: string; permanent: boolean }>;
  modelUsed: string;
}

interface BotBeliefOverview {
  active: BotBelief[];
  archivedCount: number;
  contradicted: BotBelief[];
  staleCount: number;
  avgConfidence: number;
  categoryDistribution: Record<string, number>;
}

interface Bot {
  id: number;
  name: string;
  clientId: number | null;
  isActive: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  market_conditions: "bg-orange-100 text-orange-800",
  client_facts: "bg-blue-100 text-blue-800",
  competitor_intel: "bg-red-100 text-red-800",
  product_knowledge: "bg-green-100 text-green-800",
  relationship_dynamics: "bg-purple-100 text-purple-800",
  operational: "bg-gray-100 text-gray-800",
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? "bg-green-100 text-green-800" : pct >= 40 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{pct}%</span>;
}

export default function BeliefBrowser() {
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("beliefs");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bots = [], isLoading: botsLoading } = useQuery<Bot[]>({
    queryKey: ["admin-bots"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/admin/beliefs/bots"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load bots");
      return res.json() as Promise<Bot[]>;
    },
  });

  const { data: overview, isLoading: overviewLoading } = useQuery<BotBeliefOverview>({
    queryKey: ["bot-beliefs", selectedBotId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/admin/beliefs/bots/${selectedBotId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load beliefs");
      return res.json() as Promise<BotBeliefOverview>;
    },
    enabled: !!selectedBotId,
  });

  const { data: episodic = [] } = useQuery<EpisodicSummary[]>({
    queryKey: ["episodic-summaries", selectedBotId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/admin/beliefs/episodic/${selectedBotId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load episodic summaries");
      return res.json() as Promise<EpisodicSummary[]>;
    },
    enabled: !!selectedBotId,
  });

  const archiveMutation = useMutation({
    mutationFn: async (beliefId: number) => {
      const res = await fetch(apiUrl(`/bots/${selectedBotId}/beliefs/${beliefId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to archive belief");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bot-beliefs", selectedBotId] });
      toast({ title: "Belief archived" });
    },
  });

  const selectedBot = bots.find((b) => b.id === Number(selectedBotId));

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Brain className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Belief Browser</h1>
            <p className="text-muted-foreground text-sm">Explore, manage, and audit bot belief systems</p>
          </div>
        </div>

        <div className="mb-6 flex gap-4 items-center">
          <div className="w-64">
            <Select value={selectedBotId} onValueChange={setSelectedBotId}>
              <SelectTrigger>
                <SelectValue placeholder={botsLoading ? "Loading bots…" : "Select a bot"} />
              </SelectTrigger>
              <SelectContent>
                {bots.map((bot) => (
                  <SelectItem key={bot.id} value={String(bot.id)}>
                    {bot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedBot && (
            <span className="text-sm text-muted-foreground">
              Client {selectedBot.clientId ?? "—"}
            </span>
          )}
        </div>

        {!selectedBotId && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Brain className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Select a bot above to explore its belief system</p>
            </CardContent>
          </Card>
        )}

        {selectedBotId && (
          <>
            {overviewLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading beliefs…
              </div>
            ) : overview ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{overview.active.length}</div>
                      <div className="text-sm text-muted-foreground">Active Beliefs</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{Math.round(overview.avgConfidence * 100)}%</div>
                      <div className="text-sm text-muted-foreground">Avg Confidence</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-yellow-600">{overview.staleCount}</div>
                      <div className="text-sm text-muted-foreground">Stale Beliefs</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-red-600">{overview.contradicted.length}</div>
                      <div className="text-sm text-muted-foreground">Contradictions</div>
                    </CardContent>
                  </Card>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="beliefs">Beliefs ({overview.active.length})</TabsTrigger>
                    <TabsTrigger value="contradictions" className={overview.contradicted.length > 0 ? "text-red-600" : ""}>
                      Contradictions {overview.contradicted.length > 0 && `(${overview.contradicted.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="episodic">Episodic Memory ({episodic.length})</TabsTrigger>
                    <TabsTrigger value="distribution">Distribution</TabsTrigger>
                  </TabsList>

                  <TabsContent value="beliefs">
                    <div className="space-y-2">
                      {overview.active.length === 0 && (
                        <Card className="border-dashed">
                          <CardContent className="py-10 text-center text-muted-foreground">No active beliefs yet</CardContent>
                        </Card>
                      )}
                      {overview.active.map((belief) => (
                        <Card key={belief.id} className={belief.contradictedById ? "border-red-200" : ""}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-snug">{belief.beliefText}</p>
                                <div className="flex flex-wrap gap-2 mt-2 items-center">
                                  <ConfidenceBadge confidence={belief.confidence} />
                                  <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[belief.category] ?? ""}`}>
                                    {belief.category.replace(/_/g, " ")}
                                  </Badge>
                                  {belief.immutable && (
                                    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-700">
                                      <Shield className="h-3 w-3 mr-1" /> immutable
                                    </Badge>
                                  )}
                                  {belief.contradictedById && (
                                    <Badge variant="outline" className="text-xs bg-red-100 text-red-700">
                                      <AlertTriangle className="h-3 w-3 mr-1" /> contradicted
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDistanceToNow(new Date(belief.lastConfirmedAt))} ago
                                  </span>
                                  <span className="text-xs text-muted-foreground">{belief.evidenceCount} evidence</span>
                                </div>
                              </div>
                              {!belief.immutable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => archiveMutation.mutate(belief.id)}
                                  disabled={archiveMutation.isPending}
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="contradictions">
                    {overview.contradicted.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
                          <CheckCircle className="h-8 w-8 text-green-500" />
                          No contradictions detected
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {overview.contradicted.map((belief) => (
                          <Card key={belief.id} className="border-red-200 bg-red-50/30">
                            <CardContent className="py-3 px-4">
                              <p className="text-sm font-medium">{belief.beliefText}</p>
                              <div className="flex gap-2 mt-2">
                                <ConfidenceBadge confidence={belief.confidence} />
                                <Badge variant="outline" className="text-xs bg-red-100 text-red-700">
                                  Contradicted by #{belief.contradictedById}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="episodic">
                    {episodic.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
                          <BookOpen className="h-8 w-8 text-muted-foreground" />
                          No episodic summaries yet — generated monthly using GLM 5.2 Long
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {episodic.map((ep) => (
                          <Card key={ep.id}>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base flex items-center gap-2">
                                <BookOpen className="h-4 w-4" />
                                {format(new Date(ep.periodStart), "MMMM yyyy")}
                                <Badge variant="outline" className="text-xs ml-auto">{ep.modelUsed}</Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{ep.narrative}</p>
                              {ep.turningPoints.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Turning Points</p>
                                  <ul className="text-sm space-y-1">
                                    {ep.turningPoints.map((tp, i) => (
                                      <li key={i} className="flex items-start gap-2"><ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />{tp}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {ep.anchorEvents.filter((a) => a.permanent).length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Permanent Anchors</p>
                                  {ep.anchorEvents.filter((a) => a.permanent).map((anchor, i) => (
                                    <div key={i} className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-1">
                                      <span className="font-medium">{anchor.event}</span>
                                      <span className="text-muted-foreground"> — {anchor.significance}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="distribution">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {Object.entries(overview.categoryDistribution).map(([cat, count]) => (
                        <Card key={cat}>
                          <CardContent className="pt-4">
                            <div className="text-2xl font-bold">{count}</div>
                            <Badge className={`text-xs mt-1 ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700"}`}>
                              {cat.replace(/_/g, " ")}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            ) : null}
          </>
        )}
      </div>
    </AppLayout>
  );
}
