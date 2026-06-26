import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Plus,
  Play,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Gauge,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SelfActualizationTab } from "./SelfActualizationTab";
import {
  useGaaOverview,
  useGaaGoals,
  useGaaJournal,
  useGaaEscalations,
  useGaaConstitution,
  useCreateGoal,
  useResolveEscalation,
  useRunTick,
} from "@/hooks/use-gaa";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  blocked: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  suspended: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  dead_letter: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const MODE_COLORS: Record<string, string> = {
  autonomous: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  agenda: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  mission: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-white/10 p-3">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-2xl font-semibold text-white">{value}</div>
          <div className="text-xs uppercase tracking-wide text-white/50">
            {label}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GaaConsole() {
  const { toast } = useToast();
  const overview = useGaaOverview();
  const goals = useGaaGoals();
  const journal = useGaaJournal();
  const escalations = useGaaEscalations();
  const constitution = useGaaConstitution();
  const createGoal = useCreateGoal();
  const resolveEscalation = useResolveEscalation();
  const runTick = useRunTick();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    mode: "autonomous",
    temporalTier: "reactive",
    priority: 3,
    purpose: "",
  });

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    try {
      await createGoal.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        mode: form.mode,
        temporalTier: form.temporalTier,
        priority: Number(form.priority),
        purpose: form.purpose.trim() || undefined,
      });
      toast({ title: "Goal created", description: "The GAA will plan it on the next cycle." });
      setDialogOpen(false);
      setForm({ title: "", description: "", mode: "autonomous", temporalTier: "reactive", priority: 3, purpose: "" });
    } catch (e) {
      toast({ title: "Failed to create goal", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleTick = async () => {
    try {
      const summary = await runTick.mutateAsync();
      toast({
        title: "Cycle complete",
        description: `Processed ${summary.processed} · executed ${summary.executed} · escalated ${summary.escalated} · completed ${summary.completed}`,
      });
    } catch (e) {
      toast({ title: "Cycle failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleResolve = async (
    id: number,
    decision: "approved" | "redirected" | "aborted",
  ) => {
    try {
      await resolveEscalation.mutateAsync({ id, decision });
      toast({ title: `Escalation ${decision}` });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const o = overview.data;

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-indigo-500/30 p-3">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Galaxy Autonomous Agent
              </h1>
              <p className="text-sm text-white/50">
                Constitutionally-grounded autonomy: PLAN → Constitution → KiloPro Gate → Reversibility → Execute
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTick}
              disabled={runTick.isPending}
              className="border-white/15"
            >
              {runTick.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run cycle
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New goal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create autonomous goal</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Improve onboarding completion rate"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="What outcome should the agent pursue?"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="autonomous">Autonomous</SelectItem>
                          <SelectItem value="agenda">Agenda</SelectItem>
                          <SelectItem value="mission">Mission</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Temporal tier</Label>
                      <Select value={form.temporalTier} onValueChange={(v) => setForm({ ...form, temporalTier: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="evergreen">Evergreen</SelectItem>
                          <SelectItem value="time_boxed">Time-boxed</SelectItem>
                          <SelectItem value="reactive">Reactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority (0 highest)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={9}
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Purpose</Label>
                      <Input
                        value={form.purpose}
                        onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                        placeholder="e.g. service_delivery"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createGoal.isPending}>
                    {createGoal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total goals" value={o?.totalGoals ?? "—"} icon={Gauge} />
          <StatCard label="Active" value={o?.byStatus?.active ?? 0} icon={CheckCircle2} />
          <StatCard label="Open escalations" value={o?.openEscalations ?? 0} icon={AlertTriangle} />
          <StatCard label="Constitution" value={o?.constitutionPrinciples ?? 0} icon={ShieldCheck} />
        </div>

        <Tabs defaultValue="goals">
          <TabsList>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="escalations">
              Escalations
              {(o?.openEscalations ?? 0) > 0 && (
                <Badge className="ml-2 bg-rose-500/20 text-rose-300">{o?.openEscalations}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="journal">Journal</TabsTrigger>
            <TabsTrigger value="constitution">Constitution</TabsTrigger>
            <TabsTrigger value="self-actualization">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Self-actualization
            </TabsTrigger>
          </TabsList>

          {/* Goals */}
          <TabsContent value="goals" className="mt-4 space-y-3">
            {goals.isLoading && <Loader2 className="h-5 w-5 animate-spin text-white/50" />}
            {goals.data?.length === 0 && (
              <p className="text-sm text-white/50">No goals yet. Create one to begin.</p>
            )}
            {goals.data?.map((g) => (
              <Card key={g.id} className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{g.title}</span>
                        <Badge variant="outline" className={STATUS_COLORS[g.status] ?? ""}>{g.status}</Badge>
                        <Badge variant="outline" className={MODE_COLORS[g.mode] ?? ""}>{g.mode}</Badge>
                      </div>
                      {g.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-white/60">{g.description}</p>
                      )}
                      {g.blockedReason && (
                        <p className="mt-1 text-xs text-amber-300">⚠ {g.blockedReason}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/40">
                        <span>Priority {g.priority}</span>
                        <span>Progress {g.progressScore}%</span>
                        {g.reversibilityScore != null && <span>Reversibility {g.reversibilityScore}</span>}
                        {g.riskScore != null && <span>Risk {g.riskScore}</span>}
                        <span>Spent {(g.spentCents / 100).toFixed(2)} / {(g.costEnvelopeCents / 100).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="w-28 shrink-0">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${g.progressScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Escalations */}
          <TabsContent value="escalations" className="mt-4 space-y-3">
            {escalations.data?.filter((e) => e.status === "open").length === 0 && (
              <p className="text-sm text-white/50">No open escalations.</p>
            )}
            {escalations.data?.map((e) => (
              <Card key={e.id} className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          e.severity === "high" ? "border-rose-500/30 text-rose-300" : "border-amber-500/30 text-amber-300"
                        }>{e.severity}</Badge>
                        <Badge variant="outline">{e.status}</Badge>
                        {e.goalId && <span className="text-xs text-white/40">Goal #{e.goalId}</span>}
                      </div>
                      <p className="mt-1 text-sm text-white">{e.reason}</p>
                      {e.recommendedAction && (
                        <p className="mt-1 text-xs text-white/50">Recommended: {e.recommendedAction}</p>
                      )}
                    </div>
                    {e.status === "open" && (
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" onClick={() => handleResolve(e.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => handleResolve(e.id, "redirected")}>Redirect</Button>
                        <Button size="sm" variant="outline" className="text-rose-300" onClick={() => handleResolve(e.id, "aborted")}>Abort</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Journal */}
          <TabsContent value="journal" className="mt-4">
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-sm text-white/70">Decision journal (write-ahead log)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {journal.data?.length === 0 && (
                  <p className="text-sm text-white/50">No journal entries yet.</p>
                )}
                {journal.data?.map((j) => (
                  <div key={j.id} className="flex items-start gap-3 border-b border-white/5 pb-2 text-sm last:border-0">
                    <Badge variant="outline" className="shrink-0 text-xs">{j.phase}</Badge>
                    <div className="min-w-0 flex-1">
                      <span className="text-white/80">{j.eventType}</span>
                      {j.detail && <span className="text-white/50"> — {j.detail}</span>}
                    </div>
                    <span className="shrink-0 text-xs text-white/30">
                      {new Date(j.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Constitution */}
          <TabsContent value="constitution" className="mt-4 space-y-3">
            {constitution.data?.map((p) => (
              <Card key={p.id} className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    <span className="font-medium text-white">{p.principle}</span>
                    <Badge variant="outline" className="text-xs">{p.category}</Badge>
                    <Badge variant="outline" className={
                      p.severity === "hard" ? "border-rose-500/30 text-rose-300" : "border-white/20 text-white/60"
                    }>{p.severity}</Badge>
                  </div>
                  {p.rationale && <p className="mt-1 text-sm text-white/60">{p.rationale}</p>}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Self-actualization */}
          <TabsContent value="self-actualization">
            <SelfActualizationTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
