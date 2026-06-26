import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Brain,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Dumbbell,
  Share2,
  Wrench,
  Power,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useSelfActOverview,
  useSelfActCapability,
  useSelfActReflections,
  useSelfActPractice,
  useSelfActTransfers,
  useSelfActModifications,
  useSetKillSwitch,
  useApproveModification,
  useRejectModification,
  useRollbackModification,
} from "@/hooks/use-gaa";
import type { SelfModificationRow } from "@/lib/gaa-fetch";

const TIER_COLORS: Record<string, string> = {
  unproven: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  weak: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  developing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  competent: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  strong: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const MOD_STATUS_COLORS: Record<string, string> = {
  proposed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  shadow_testing: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  promoted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  rolled_back: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  killed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function TrendIcon({ trend }: { trend: number }) {
  if (trend > 0.02) return <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />;
  if (trend < -0.02) return <TrendingDown className="h-3.5 w-3.5 text-rose-300" />;
  return <Minus className="h-3.5 w-3.5 text-white/40" />;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function SelfActualizationTab() {
  const { toast } = useToast();
  const overview = useSelfActOverview();
  const capability = useSelfActCapability();
  const reflections = useSelfActReflections();
  const practice = useSelfActPractice();
  const transfers = useSelfActTransfers();
  const modifications = useSelfActModifications();
  const setKillSwitch = useSetKillSwitch();
  const approveMod = useApproveModification();
  const rejectMod = useRejectModification();
  const rollbackMod = useRollbackModification();

  const [confirmKill, setConfirmKill] = useState(false);

  const snap = overview.data?.snapshot;
  const killActive = overview.data?.killSwitch ?? false;

  const handleKillSwitch = async (active: boolean) => {
    if (active && !confirmKill) {
      setConfirmKill(true);
      return;
    }
    setConfirmKill(false);
    try {
      const res = await setKillSwitch.mutateAsync(active);
      toast({
        title: active ? "Kill switch engaged" : "Kill switch released",
        description: active
          ? `Autonomous self-change halted. Rolled back ${res.rolledBack} promoted modification(s).`
          : "Self-actualization may resume on the next cycle.",
      });
    } catch (e) {
      toast({
        title: "Failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleModAction = async (
    action: "approve" | "reject" | "rollback",
    mod: SelfModificationRow,
  ) => {
    try {
      if (action === "approve") {
        await approveMod.mutateAsync(mod.id);
        toast({ title: "Modification approved", description: "Entering shadow testing." });
      } else if (action === "reject") {
        await rejectMod.mutateAsync({ id: mod.id, reason: "Rejected by operator" });
        toast({ title: "Modification rejected" });
      } else {
        await rollbackMod.mutateAsync({ id: mod.id });
        toast({ title: "Modification rolled back" });
      }
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Kill switch + snapshot */}
      <Card
        className={
          killActive
            ? "border-rose-500/40 bg-rose-500/5"
            : "border-white/10 bg-white/5"
        }
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div
              className={
                "rounded-lg p-3 " +
                (killActive ? "bg-rose-500/20" : "bg-white/10")
              }
            >
              <Power
                className={
                  "h-5 w-5 " + (killActive ? "text-rose-300" : "text-white")
                }
              />
            </div>
            <div>
              <div className="font-medium text-white">
                Self-modification kill switch
              </div>
              <div className="text-xs text-white/50">
                {killActive
                  ? "ENGAGED — all autonomous self-change halted and promoted changes rolled back."
                  : "Released — the engine may propose, shadow-test and promote safe self-changes."}
              </div>
              {confirmKill && (
                <div className="mt-1 text-xs text-rose-300">
                  Click again to confirm engaging the kill switch.
                </div>
              )}
            </div>
          </div>
          <Switch
            checked={killActive}
            disabled={setKillSwitch.isPending}
            onCheckedChange={handleKillSwitch}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SnapStat label="Avg competence" value={snap ? pct(snap.avgCompetence) : "—"} icon={Brain} />
        <SnapStat label="Avg confidence" value={snap ? pct(snap.avgConfidence) : "—"} icon={Gauge2} />
        <SnapStat label="Practice adopted" value={snap ? `${snap.practiceAdopted}/${snap.practiceRuns}` : "—"} icon={Dumbbell} />
        <SnapStat label="Mods promoted" value={snap ? `${snap.modsPromoted}` : "—"} icon={Wrench} />
      </div>

      {/* Capability self-model */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm text-white/70">
            Capability self-model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {capability.isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-white/50" />
          )}
          {capability.data?.length === 0 && (
            <p className="text-sm text-white/50">
              No capability evidence yet — the model populates as bots complete tasks.
            </p>
          )}
          {capability.data?.slice(0, 40).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-white/5 pb-2 text-sm last:border-0"
            >
              <span className="w-16 shrink-0 text-xs text-white/40">
                Bot #{c.botId}
              </span>
              <span className="w-24 shrink-0 text-white/80">{c.taskCategory}</span>
              <Badge variant="outline" className={TIER_COLORS[c.strengthTier] ?? ""}>
                {c.strengthTier}
              </Badge>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: pct(c.competence) }}
                  />
                </div>
                <span className="text-xs text-white/50">{pct(c.competence)}</span>
              </div>
              <span className="flex items-center gap-1 text-xs text-white/40">
                <TrendIcon trend={c.trend} />
                conf {pct(c.confidence)} · n={c.sampleCount}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Self-modifications */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm text-white/70">
            Self-modifications (governance + shadow + audit)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {modifications.data?.length === 0 && (
            <p className="text-sm text-white/50">No self-modifications proposed.</p>
          )}
          {modifications.data?.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-white/5 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{m.title}</span>
                <Badge variant="outline" className={MOD_STATUS_COLORS[m.status] ?? ""}>
                  {m.status}
                </Badge>
                <Badge variant="outline" className="text-xs">{m.modType}</Badge>
                <Badge
                  variant="outline"
                  className={
                    m.riskLevel === "high"
                      ? "border-rose-500/30 text-rose-300"
                      : m.riskLevel === "medium"
                        ? "border-amber-500/30 text-amber-300"
                        : "border-white/20 text-white/60"
                  }
                >
                  {m.riskLevel} risk
                </Badge>
                {m.humanGated && (
                  <Badge variant="outline" className="border-fuchsia-500/30 text-fuchsia-300">
                    human-gated
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-white/60">{m.rationale}</p>
              {m.governanceDecision && (
                <p className="mt-1 text-xs text-white/40">
                  Governance: {m.governanceDecision}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/30">
                  by {m.proposedBy} · {new Date(m.createdAt).toLocaleString()}
                </span>
                {m.status === "proposed" && (
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => handleModAction("approve", m)}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-300"
                      onClick={() => handleModAction("reject", m)}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {(m.status === "promoted" || m.status === "shadow_testing") && (
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-300"
                      onClick={() => handleModAction("rollback", m)}
                    >
                      Roll back
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reflections */}
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm text-white/70">
              Deep reflections (durable lessons)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reflections.data?.length === 0 && (
              <p className="text-sm text-white/50">No reflections recorded.</p>
            )}
            {reflections.data?.slice(0, 20).map((r) => (
              <div key={r.id} className="border-b border-white/5 pb-2 text-sm last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">{r.rootCauseType}</Badge>
                  {r.taskCategory && (
                    <span className="text-xs text-white/40">{r.taskCategory}</span>
                  )}
                  <span className="text-xs text-white/30">Bot #{r.botId}</span>
                </div>
                <p className="mt-1 text-white/80">{r.durableLesson}</p>
                {r.preventionRule && (
                  <p className="mt-1 text-xs text-emerald-300/80">
                    Prevent: {r.preventionRule}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Practice + transfers */}
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-white/70">
              <Dumbbell className="h-4 w-4" /> Practice & knowledge transfer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {practice.data?.slice(0, 10).map((p) => (
              <div key={`pr-${p.id}`} className="border-b border-white/5 pb-2 text-sm last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">{p.taskCategory}</Badge>
                  {p.adopted ? (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                      adopted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-white/50">
                      {p.passedFidelity ? "passed" : "discarded"}
                    </Badge>
                  )}
                  <span className="text-xs text-white/40">
                    {pct(p.baselineScore)} → {pct(p.practiceScore)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-white/60">{p.practiceTask}</p>
              </div>
            ))}
            {transfers.data && transfers.data.length > 0 && (
              <div className="pt-2">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
                  <Share2 className="h-3.5 w-3.5" /> Knowledge transfers
                </div>
                {transfers.data.slice(0, 10).map((t) => (
                  <div key={`kt-${t.id}`} className="border-b border-white/5 pb-2 text-sm last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">{t.status}</Badge>
                      <span className="text-xs text-white/40">
                        Bot #{t.sourceBotId ?? "?"} → #{t.targetBotId}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-white/60">{t.distilledBelief}</p>
                    {t.conflictResolution && (
                      <p className="mt-1 text-xs text-amber-300/80">
                        Conflict: {t.conflictResolution}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(!practice.data || practice.data.length === 0) &&
              (!transfers.data || transfers.data.length === 0) && (
                <p className="text-sm text-white/50">No practice or transfers yet.</p>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SnapStat({
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

function Gauge2({ className }: { className?: string }) {
  return <TrendingUp className={className} />;
}
