import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Zap, CheckCircle2, XCircle, TrendingUp, AlertTriangle, Link2, Shield, Plus, X, ArrowUpRight, ArrowDownRight, Minus, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EngineScore {
  score: number;
  cited: boolean;
}

interface AeoScore {
  id: number;
  clientId: number | null;
  sourceUrl: string;
  overallScore: number;
  engineScores: Record<string, EngineScore>;
  citationCount: number;
  recommendations: string[];
  scannedAt: string;
  createdAt: string;
}

interface CompetitorData {
  id: number;
  companyName: string;
  url: string;
  addedBy: string;
  active: boolean;
  createdAt: string;
  latestScore: {
    overallScore: number;
    citationCount: number;
    engineScores: Record<string, EngineScore>;
    scannedAt: string;
  } | null;
  delta: number | null;
}

interface CompetitorsResponse {
  clientScore: number | null;
  competitors: CompetitorData[];
}

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  bing_copilot: "Bing Copilot",
  meta_ai: "Meta AI",
  deepseek: "DeepSeek",
  grok: "Grok",
  claude: "Claude",
  google_ai: "Google AI",
};

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-yellow-400";
  return "text-destructive";
}

function getScoreBgColor(score: number): string {
  if (score >= 70) return "border-emerald-500/20 bg-emerald-500/5";
  if (score >= 40) return "border-yellow-500/20 bg-yellow-500/5";
  return "border-destructive/20 bg-destructive/5";
}

export function AeoIntelligenceTab({ clientId }: { clientId: number }) {
  const { data: scores, isLoading } = useQuery<AeoScore[]>({
    queryKey: ["aeo-scores", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/integrations/piratemonster/scores/${clientId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!scores || scores.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed border-border/50 bg-transparent shadow-none">
          <CardContent className="p-12 text-center">
            <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-tech font-bold mb-2">No AEO Data Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Connect PirateMonster to start receiving AEO (Answer Engine Optimization) intelligence for this client.
            </p>
            <div className="text-xs text-muted-foreground font-tech space-y-1">
              <p>1. Go to the Integrations page and configure the PirateMonster webhook</p>
              <p>2. PirateMonster will push scan results automatically</p>
              <p>3. Results will appear here with per-engine breakdowns</p>
            </div>
          </CardContent>
        </Card>
        <ContentAttributionSection clientId={clientId} />
        <CompetitorsSection clientId={clientId} />
      </div>
    );
  }

  const latest = scores[0];
  const engines = latest.engineScores;
  const citedCount = Object.values(engines).filter(e => e.cited).length;
  const totalEngines = Object.keys(engines).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={getScoreBgColor(latest.overallScore)}>
          <CardContent className="p-6 text-center">
            <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Cloud 9 Score</div>
            <div className={`text-5xl font-display font-bold ${getScoreColor(latest.overallScore)}`}>
              {latest.overallScore}
            </div>
            <div className="text-xs text-muted-foreground font-tech mt-1">out of 100</div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center">
            <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Citations</div>
            <div className="text-5xl font-display font-bold text-primary">
              {latest.citationCount}
            </div>
            <div className="text-xs text-muted-foreground font-tech mt-1">
              {citedCount}/{totalEngines} engines citing
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="p-6 text-center">
            <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Last Scanned</div>
            <div className="text-lg font-tech font-bold text-foreground mt-3">
              {format(new Date(latest.scannedAt), "MMM d, yyyy")}
            </div>
            <div className="text-xs text-muted-foreground font-tech mt-1">
              {format(new Date(latest.scannedAt), "h:mm a")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-6">
          <h3 className="text-lg font-display font-bold flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            9-Engine Breakdown
          </h3>
          <div className="text-xs text-muted-foreground font-tech mb-2">
            <Link2 className="w-3 h-3 inline mr-1" />
            {latest.sourceUrl}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {Object.entries(engines).map(([key, engine]) => (
              <div
                key={key}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  engine.cited
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-destructive/20 bg-destructive/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  {engine.cited ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                  <span className="text-sm font-tech">{ENGINE_LABELS[key] || key}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-display font-bold ${getScoreColor(engine.score)}`}>
                    {engine.score}
                  </span>
                  <Badge
                    variant={engine.cited ? "default" : "destructive"}
                    className={`text-[10px] ${engine.cited ? "bg-emerald-600" : ""}`}
                  >
                    {engine.cited ? "CITED" : "NOT CITED"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {latest.recommendations.length > 0 && (
        <Card className="border-border/40">
          <CardContent className="p-6">
            <h3 className="text-lg font-display font-bold flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Top Recommendations
            </h3>
            <div className="space-y-3">
              {latest.recommendations.slice(0, 3).map((rec, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl bg-secondary/30">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-tech font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scores.length > 1 && (
        <Card className="border-border/40">
          <CardContent className="p-6">
            <h3 className="text-lg font-display font-bold mb-4">Scan History</h3>
            <div className="space-y-2">
              {scores.slice(1, 6).map((score) => (
                <div key={score.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-display font-bold ${getScoreColor(score.overallScore)}`}>
                      {score.overallScore}
                    </span>
                    <span className="text-sm text-muted-foreground font-tech">{score.sourceUrl}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-tech">
                    {format(new Date(score.scannedAt), "MMM d, yyyy")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ContentAttributionSection clientId={clientId} />

      <CompetitorsSection clientId={clientId} />
    </div>
  );
}

function CompetitorsSection({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");

  const { data, isLoading } = useQuery<CompetitorsResponse>({
    queryKey: ["competitors", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/integrations/piratemonster/competitors/${clientId}`);
      if (!res.ok) return { clientScore: null, competitors: [] };
      return res.json();
    },
  });

  const trackMutation = useMutation({
    mutationFn: async ({ url, companyName }: { url: string; companyName: string }) => {
      const res = await fetch(`${BASE}/api/integrations/piratemonster/competitors/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, companyName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to track competitor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors", clientId] });
      setShowModal(false);
      setNewUrl("");
      setNewName("");
    },
  });

  const untrackMutation = useMutation({
    mutationFn: async (competitorId: number) => {
      const res = await fetch(`${BASE}/api/integrations/piratemonster/competitors/${clientId}/${competitorId}/untrack`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to untrack competitor");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitors", clientId] });
    },
  });

  const handleTrack = () => {
    const trimmedUrl = newUrl.trim();
    const trimmedName = newName.trim();
    if (!trimmedUrl || !trimmedName) return;
    const normalized = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    trackMutation.mutate({ url: normalized, companyName: trimmedName });
  };

  const competitors = data?.competitors ?? [];

  return (
    <Card className="border-border/40">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-display font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Competitors
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModal(true)}
            className="font-tech text-xs"
            disabled={competitors.length >= 10}
          >
            <Plus className="w-3 h-3 mr-1" />
            Track Competitor
          </Button>
        </div>

        {showModal && (
          <div className="mb-4 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-tech font-bold">Track New Competitor</span>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Input
              placeholder="Company name (e.g., Acme Corp)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="e.g., acme.com"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="text-sm"
            />
            {trackMutation.isError && (
              <p className="text-destructive text-xs">{(trackMutation.error as Error).message}</p>
            )}
            <Button
              onClick={handleTrack}
              disabled={trackMutation.isPending || !newUrl || !newName}
              variant="glow"
              size="sm"
              className="w-full font-tech"
            >
              {trackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Add Competitor
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : competitors.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No competitors being tracked yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Track Competitor" to add one and compare AEO scores.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {competitors.map((comp) => (
              <div
                key={comp.id}
                className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-tech font-bold text-sm truncate">{comp.companyName}</div>
                    <div className="text-xs text-muted-foreground font-tech truncate">{comp.url}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {comp.latestScore ? (
                    <>
                      <div className="text-right">
                        <div className={`text-lg font-display font-bold ${getScoreColor(comp.latestScore.overallScore)}`}>
                          {comp.latestScore.overallScore}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-tech">
                          {comp.latestScore.citationCount} citations
                        </div>
                      </div>
                      {comp.delta !== null && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-tech ${
                            comp.delta > 0
                              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                              : comp.delta < 0
                                ? "text-red-400 border-red-500/30 bg-red-500/10"
                                : "text-muted-foreground border-border/30"
                          }`}
                        >
                          {comp.delta > 0 ? (
                            <><ArrowUpRight className="w-3 h-3 mr-0.5" />+{comp.delta}</>
                          ) : comp.delta < 0 ? (
                            <><ArrowDownRight className="w-3 h-3 mr-0.5" />{comp.delta}</>
                          ) : (
                            <><Minus className="w-3 h-3 mr-0.5" />0</>
                          )}
                        </Badge>
                      )}
                      <div className="text-[10px] text-muted-foreground font-tech">
                        {format(new Date(comp.latestScore.scannedAt), "MMM d")}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground font-tech">No scan data</span>
                  )}
                  <button
                    onClick={() => untrackMutation.mutate(comp.id)}
                    disabled={untrackMutation.isPending}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    title="Remove competitor"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ContentAttribution {
  contentId: number;
  title: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  type: string;
  baselineScore: number | null;
  currentScore: number | null;
  delta: number | null;
  enginesGained: string[];
  enginesLost: string[];
  status: string;
}

interface ContentAttributionResponse {
  linked: boolean;
  bingolingoClients?: Array<{ id: number; name: string; slug: string }>;
  content: ContentAttribution[];
}

function ContentAttributionSection({ clientId }: { clientId: number }) {
  const { data, isLoading } = useQuery<ContentAttributionResponse>({
    queryKey: ["content-attribution", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/integrations/piratemonster/content-attribution/${clientId}`);
      if (!res.ok) return { linked: false, content: [] };
      return res.json();
    },
  });

  if (isLoading) return null;
  if (!data?.linked) return null;
  if (data.content.length === 0) return null;

  return (
    <Card className="border-border/40">
      <CardContent className="p-6">
        <h3 className="text-lg font-display font-bold flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-primary" />
          Content Attribution
        </h3>
        <p className="text-xs text-muted-foreground font-tech mb-4">
          BingoLingo content linked to this client — showing AEO score impact from publish to latest scan.
        </p>
        <div className="space-y-2">
          {data.content.map((item) => (
            <div
              key={item.contentId}
              className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30"
            >
              <div className="flex-1 min-w-0">
                <div className="font-tech font-bold text-sm truncate">{item.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                  {item.publishedAt && (
                    <span className="text-[10px] text-muted-foreground font-tech">
                      Published {format(new Date(item.publishedAt), "MMM d, yyyy")}
                    </span>
                  )}
                  {item.publishedUrl && (
                    <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                      <ExternalLink className="w-2.5 h-2.5" /> URL
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                {item.status === "awaiting_scan" ? (
                  <span className="text-xs text-muted-foreground font-tech">Awaiting scan</span>
                ) : (
                  <>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-tech">Baseline → Current</div>
                      <div className="text-sm font-tech">
                        <span className="text-muted-foreground">{item.baselineScore}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className={`font-bold ${item.currentScore !== null && item.currentScore >= 70 ? "text-emerald-400" : item.currentScore !== null && item.currentScore >= 40 ? "text-yellow-400" : "text-destructive"}`}>
                          {item.currentScore}
                        </span>
                      </div>
                    </div>
                    {item.delta !== null && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-tech ${
                          item.delta > 0
                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                            : item.delta < 0
                              ? "text-red-400 border-red-500/30 bg-red-500/10"
                              : "text-muted-foreground border-border/30"
                        }`}
                      >
                        {item.delta > 0 ? (
                          <><ArrowUpRight className="w-3 h-3 mr-0.5" />+{item.delta}</>
                        ) : item.delta < 0 ? (
                          <><ArrowDownRight className="w-3 h-3 mr-0.5" />{item.delta}</>
                        ) : (
                          <><Minus className="w-3 h-3 mr-0.5" />0</>
                        )}
                      </Badge>
                    )}
                    {item.enginesGained.length > 0 && (
                      <div className="text-[10px] text-emerald-400 font-tech">
                        +{item.enginesGained.map(e => ENGINE_LABELS[e] || e).join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
