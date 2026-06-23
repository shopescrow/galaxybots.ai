import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  Loader2,
  FlaskConical,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  Plus,
  Trophy,
} from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Experiment = {
  id: number;
  hypothesis: string;
  metric: string;
  status: string;
  currentSampleSizeA: number;
  currentSampleSizeB: number;
  targetSampleSize: number;
  metricValueA: number | null;
  metricValueB: number | null;
  pValue: number | null;
  tStatistic: number | null;
  significanceReached: boolean;
  winner: string | null;
  result: string | null;
  startedAt: string;
  endedAt: string | null;
  proposedByBotName: string | null;
};

const STATUS_ICON: Record<string, React.ElementType> = {
  running: Clock,
  completed: CheckCircle2,
  stopped: PauseCircle,
  pending_review: Clock,
};
const STATUS_COLOR: Record<string, string> = {
  running: "text-blue-500",
  completed: "text-green-500",
  stopped: "text-muted-foreground",
  pending_review: "text-yellow-500",
};

function ExperimentCard({ exp, onStop }: { exp: Experiment; onStop: (id: number) => void }) {
  const Icon = STATUS_ICON[exp.status] ?? Clock;
  const color = STATUS_COLOR[exp.status] ?? "text-muted-foreground";
  const progress = Math.min(
    100,
    Math.round(((exp.currentSampleSizeA + exp.currentSampleSizeB) / Math.max(exp.targetSampleSize, 1)) * 100),
  );

  return (
    <Card className="border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${color}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{exp.hypothesis}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="text-[10px] font-tech">metric: {exp.metric}</Badge>
              {exp.proposedByBotName && (
                <Badge variant="outline" className="text-[10px]">by {exp.proposedByBotName}</Badge>
              )}
            </div>

            {exp.status === "running" && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress: {exp.currentSampleSizeA + exp.currentSampleSizeB}/{exp.targetSampleSize}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {exp.pValue != null && (
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>p={exp.pValue.toFixed(3)}</span>
                    {exp.metricValueA != null && <span>A: {(exp.metricValueA * 100).toFixed(1)}%</span>}
                    {exp.metricValueB != null && <span>B: {(exp.metricValueB * 100).toFixed(1)}%</span>}
                  </div>
                )}
              </div>
            )}

            {exp.status === "completed" && exp.result && (
              <div className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                {exp.winner ? (
                  <Trophy className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
                <p className="text-xs text-muted-foreground">{exp.result}</p>
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                Started {new Date(exp.startedAt).toLocaleDateString()}
                {exp.endedAt && ` · Ended ${new Date(exp.endedAt).toLocaleDateString()}`}
              </span>
              {exp.status === "running" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => onStop(exp.id)}
                >
                  Stop
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewExperimentForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [hypothesis, setHypothesis] = useState("");
  const [metric, setMetric] = useState("outcome_score");
  const [sampleSize, setSampleSize] = useState("100");

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hypothesis,
          metric,
          targetSampleSize: parseInt(sampleSize),
        }),
      });
      if (!res.ok) throw new Error("Failed to create experiment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["self-improvement", "experiments"] });
      onClose();
    },
  });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">New Hypothesis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Hypothesis</Label>
          <Input
            placeholder="e.g. 48-hour follow-up outperforms 24-hour for enterprise clients"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Metric</Label>
            <Input
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="outcome_score"
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Target Sample</Label>
            <Input
              type="number"
              value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
              min={20}
              max={10000}
              className="text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!hypothesis.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Hypothesis"}
          </Button>
        </div>
        {create.isError && (
          <p className="text-xs text-destructive">{String(create.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExperimentsPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const experiments = useQuery<Experiment[]>({
    queryKey: ["self-improvement", "experiments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/experiments`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const stop = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/self-improvement/experiments/${id}/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["self-improvement", "experiments"] }),
  });

  const filtered = (experiments.data ?? []).filter(
    (e) => filter === "all" || e.status === filter,
  );

  const counts = {
    all: experiments.data?.length ?? 0,
    running: experiments.data?.filter((e) => e.status === "running").length ?? 0,
    completed: experiments.data?.filter((e) => e.status === "completed").length ?? 0,
    stopped: experiments.data?.filter((e) => e.status === "stopped").length ?? 0,
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <FlaskConical className="w-3 h-3 mr-1" />
                Hypothesis Engine
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              A/B <span className="text-gradient">Experiments</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Submit hypotheses · Track A/B tests · Auto-promote winners
            </p>
          </div>
          <Button onClick={() => setShowNew(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Hypothesis
          </Button>
        </div>

        {showNew && (
          <div className="mb-6">
            <NewExperimentForm onClose={() => setShowNew(false)} />
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {(["all", "running", "completed", "stopped"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f as keyof typeof counts]})
            </button>
          ))}
        </div>

        {experiments.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FlaskConical className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {filter === "all"
                ? "No experiments yet. Submit your first hypothesis to get started."
                : `No ${filter} experiments.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((exp) => (
              <ErrorBoundary key={exp.id}>
                <ExperimentCard exp={exp} onStop={(id) => stop.mutate(id)} />
              </ErrorBoundary>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
