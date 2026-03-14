import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Zap, CheckCircle2, XCircle, TrendingUp, AlertTriangle, Link2 } from "lucide-react";
import { format } from "date-fns";

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
    </div>
  );
}
