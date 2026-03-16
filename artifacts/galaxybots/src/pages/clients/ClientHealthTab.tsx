import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquarePlus,
  Activity,
  Lightbulb,
} from "lucide-react";
import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface HealthSummary {
  current: {
    score: number;
    tag: string;
    trend: string;
    topSignals: { signal: string; count: number; weight: number }[];
    recommendedAction: string;
    computedAt: string;
  } | null;
  history: { score: number; tag: string; computedAt: string }[];
  notes: {
    id: number;
    note: string;
    tagOverride: string | null;
    authorName: string | null;
    createdAt: string;
  }[];
}

const TAG_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  healthy: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/30",
    label: "HEALTHY",
  },
  at_risk: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    label: "AT RISK",
  },
  critical: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/30",
    label: "CRITICAL",
  },
};

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp className="w-4 h-4 text-green-400" />;
  if (trend === "declining") return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function formatSignalName(signal: string) {
  return signal
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function HealthScoreGauge({ score, tag }: { score: number; tag: string }) {
  const style = TAG_STYLES[tag] || TAG_STYLES.healthy;
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={tag === "healthy" ? "#22c55e" : tag === "at_risk" ? "#eab308" : "#ef4444"}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-display font-bold">{score}</span>
        <span className={`text-[10px] font-tech uppercase ${style.text}`}>{style.label}</span>
      </div>
    </div>
  );
}

export function ClientHealthTab({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [tagOverride, setTagOverride] = useState<string | null>(null);

  const { data: health, isLoading } = useQuery<HealthSummary>({
    queryKey: ["client-health", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/client-health/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch health data");
      return res.json();
    },
  });

  const computeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/client-health/${clientId}/compute`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to compute");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-health", clientId] });
    },
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/client-health/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: noteText,
          tagOverride: tagOverride,
        }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      return res.json();
    },
    onSuccess: () => {
      setNoteText("");
      setTagOverride(null);
      queryClient.invalidateQueries({ queryKey: ["client-health", clientId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const current = health?.current;
  const historyData = (health?.history || []).map((h) => ({
    date: new Date(h.computedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: h.score,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary" />
                Health Score
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-tech gap-1"
                onClick={() => computeMutation.mutate()}
                disabled={computeMutation.isPending}
              >
                {computeMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {current ? (
              <>
                <HealthScoreGauge score={current.score} tag={current.tag} />
                <div className="flex items-center justify-center gap-2">
                  <TrendIcon trend={current.trend} />
                  <span className="text-sm font-tech text-muted-foreground capitalize">
                    {current.trend}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground text-center font-tech">
                  Last computed: {new Date(current.computedAt).toLocaleString()}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Heart className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-tech">No health data yet</p>
                <Button
                  variant="glow"
                  size="sm"
                  className="mt-3 font-tech"
                  onClick={() => computeMutation.mutate()}
                  disabled={computeMutation.isPending}
                >
                  Compute Now
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              90-Day Health Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="url(#healthGrad)"
                    strokeWidth={2}
                    name="Health Score"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                Not enough data points for trend visualization
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {current && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                AI Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded-xl border ${TAG_STYLES[current.tag]?.border || "border-border/40"} ${TAG_STYLES[current.tag]?.bg || ""}`}>
                <p className="text-sm">{current.recommendedAction}</p>
              </div>

              {current.topSignals && current.topSignals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider">
                    Top Engagement Signals
                  </p>
                  {current.topSignals.map((sig, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-secondary/50"
                    >
                      <span className="text-sm">{formatSignalName(sig.signal)}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {sig.count}x
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          +{sig.weight}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-primary" />
              Health Notes & Overrides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a health note or context..."
                rows={3}
                className="font-mono text-sm"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs font-tech text-muted-foreground">Override tag:</span>
                {["healthy", "at_risk", "critical"].map((t) => {
                  const style = TAG_STYLES[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setTagOverride(tagOverride === t ? null : t)}
                      className={`px-2 py-1 rounded text-[10px] font-tech border transition-all ${
                        tagOverride === t
                          ? `${style.bg} ${style.text} ${style.border}`
                          : "border-border/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full font-tech text-xs"
                onClick={() => noteMutation.mutate()}
                disabled={noteMutation.isPending || !noteText.trim()}
              >
                {noteMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <MessageSquarePlus className="w-3 h-3 mr-1" />
                )}
                Add Note
              </Button>
            </div>

            {health?.notes && health.notes.length > 0 && (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {health.notes.map((note) => (
                  <div key={note.id} className="p-3 rounded-lg bg-secondary/50 border border-border/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-tech text-muted-foreground">
                        {note.authorName || "Admin"}
                      </span>
                      {note.tagOverride && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${TAG_STYLES[note.tagOverride]?.text || ""} ${TAG_STYLES[note.tagOverride]?.border || ""}`}
                        >
                          {TAG_STYLES[note.tagOverride]?.label || note.tagOverride}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{note.note}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
