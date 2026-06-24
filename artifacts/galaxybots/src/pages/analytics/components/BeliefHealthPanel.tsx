import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Brain, AlertTriangle, ShieldCheck } from "lucide-react";
import { BASE } from "./types";

interface BotDomainHealth {
  botId: number;
  botName: string;
  domain: string;
  avgConfidence: number;
  beliefCount: number;
  contradictionCount: number;
  trustScore: number;
  status: "green" | "amber" | "red";
}

interface BeliefHealthSummary {
  botId: number;
  botName: string;
  domains: BotDomainHealth[];
  leastReliableDomain: string | null;
  overallTrustScore: number;
  contradictionRate7d: number;
}

interface BeliefHealthResponse {
  bots: BeliefHealthSummary[];
  computedAt: string;
}

function TrustScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  if (score >= 0.7) {
    return (
      <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/30 bg-green-500/10">
        {pct}% trustworthy
      </Badge>
    );
  }
  if (score >= 0.4) {
    return (
      <Badge variant="outline" className="text-[9px] text-yellow-400 border-yellow-500/30 bg-yellow-500/10">
        {pct}% trustworthy
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30 bg-red-500/10">
      {pct}% trustworthy
    </Badge>
  );
}

function StatusDot({ status }: { status: "green" | "amber" | "red" }) {
  const colors = {
    green: "bg-green-500",
    amber: "bg-yellow-500",
    red: "bg-red-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]} flex-shrink-0`}
    />
  );
}

function ContradictionSparkline({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color = rate < 0.1 ? "text-green-400" : rate < 0.25 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={`font-mono text-xs ${color}`}>
      {pct}% / 7d
    </span>
  );
}

export function BeliefHealthPanel() {
  const { data, isLoading, error } = useQuery<BeliefHealthResponse>({
    queryKey: ["intelligence", "belief-health"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/intelligence/belief-health`);
      if (!res.ok) throw new Error("Failed to fetch belief health");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> Belief Health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || data.bots.length === 0) {
    return (
      <Card className="bg-card border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> Belief Health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <p className="text-muted-foreground text-sm font-tech">
            No belief data available yet — belief health tracks as bots accumulate knowledge.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/50 lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Belief Health
          </CardTitle>
          <span className="text-[10px] font-tech text-muted-foreground">
            Updated {new Date(data.computedAt).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-xs text-muted-foreground font-tech mt-1">
          Epistemic reliability of director bots by domain — trust scores combine belief confidence with contradiction rate.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/30">
          {data.bots.map((bot) => (
            <div key={bot.botId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{bot.botName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <ContradictionSparkline rate={bot.contradictionRate7d} />
                  <TrustScoreBadge score={bot.overallTrustScore} />
                </div>
              </div>

              {bot.leastReliableDomain && (
                <div className="flex items-center gap-1.5 mb-2 text-xs text-yellow-400/80 font-tech">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>Least reliable domain: <strong>{bot.leastReliableDomain}</strong></span>
                </div>
              )}

              {bot.domains.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {bot.domains.map((d) => (
                    <div
                      key={d.domain}
                      className="flex items-start gap-2 rounded-md bg-muted/30 border border-border/20 px-3 py-2"
                    >
                      <StatusDot status={d.status} />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium capitalize truncate">
                          {d.domain.replace(/_/g, " ")}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-tech">
                          {Math.round(d.avgConfidence * 100)}% conf
                          {d.contradictionCount > 0 && (
                            <span className="text-red-400 ml-1">
                              · {d.contradictionCount} conflict{d.contradictionCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-tech">No domain beliefs recorded yet.</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
