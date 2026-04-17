import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetCrmSyncRun,
  getGetCrmSyncRunQueryKey,
  useListCrmSyncChanges,
  getListCrmSyncChangesQueryKey,
  useDecideCrmSyncChange,
  useApplyAllCrmSyncChanges,
  useRejectAllCrmSyncChanges,
  useRollbackCrmSyncRun,
  useReblueprintCrmFromDrift,
  getListCrmSyncRunsQueryKey,
  getGetCrmQueryKey,
  type ListCrmSyncChangesChangeType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Check, X, Undo2, AlertTriangle, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SyncReport() {
  const { id, runId } = useParams();
  const crmId = parseInt(id || "0", 10);
  const syncRunId = parseInt(runId || "0", 10);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<ListCrmSyncChangesChangeType | "all">("all");

  const { data: run, isLoading: runLoading } = useGetCrmSyncRun(crmId, syncRunId, {
    query: { enabled: !!crmId && !!syncRunId, queryKey: getGetCrmSyncRunQueryKey(crmId, syncRunId) },
  });
  const changesQuery = filter === "all" ? {} : { changeType: filter };
  const { data: changesData, isLoading: changesLoading } = useListCrmSyncChanges(
    crmId,
    syncRunId,
    changesQuery,
    {
      query: {
        enabled: !!crmId && !!syncRunId,
        queryKey: getListCrmSyncChangesQueryKey(crmId, syncRunId, changesQuery),
      },
    },
  );

  const decide = useDecideCrmSyncChange();
  const applyAll = useApplyAllCrmSyncChanges();
  const rejectAll = useRejectAllCrmSyncChanges();
  const rollback = useRollbackCrmSyncRun();
  const reblueprint = useReblueprintCrmFromDrift();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetCrmSyncRunQueryKey(crmId, syncRunId) });
    qc.invalidateQueries({ queryKey: getListCrmSyncChangesQueryKey(crmId, syncRunId) });
    qc.invalidateQueries({ queryKey: getListCrmSyncRunsQueryKey(crmId) });
    qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crmId) });
  };

  if (!crmId || !syncRunId) return <div>Invalid sync run</div>;

  if (runLoading || !run) {
    return <Skeleton className="h-64 w-full" />;
  }

  const drift = run.schemaDrift;
  const hasDrift = !!drift && (drift.added.length + drift.removed.length + drift.changed.length > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
      <div>
        <Link
          href={`/crms/${crmId}/syncs`}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Sync History
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Sync Run #{run.id}</h1>
          <Badge>{run.status}</Badge>
          <Badge variant="outline">{run.triggeredBy}</Badge>
          <Badge variant="outline">policy: {run.conflictPolicy}</Badge>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          Started {new Date(run.startedAt).toLocaleString()}
          {run.completedAt && ` · Completed ${new Date(run.completedAt).toLocaleString()}`}
        </p>
      </div>

      {run.errorMessage && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4 text-sm">
            <strong className="text-destructive">Error:</strong> {run.errorMessage}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="New" value={run.totals.new} tone="success" />
        <StatCard label="Changed" value={run.totals.changed} tone="info" />
        <StatCard label="Unchanged" value={run.totals.unchanged} tone="muted" />
        <StatCard label="Removed" value={run.totals.removed} tone="warn" />
        <StatCard label="Conflicts" value={run.totals.conflicts} tone="danger" />
      </div>

      {hasDrift && drift && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" /> Schema Drift Detected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>The source schema changed since the CRM was committed. The sync was paused. Choose an action:</p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
              {drift.added.map((f) => <li key={`a-${f.name}`}>+ {f.name} ({f.type})</li>)}
              {drift.removed.map((f) => <li key={`r-${f.name}`}>− {f.name} ({f.type})</li>)}
              {drift.changed.map((f) => <li key={`c-${f.name}`}>~ {f.name}: {f.oldType} → {f.newType}</li>)}
            </ul>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() =>
                  reblueprint.mutate(
                    { id: crmId, runId: syncRunId },
                    {
                      onSuccess: () => {
                        toast({ title: "Blueprint updated to match source" });
                        invalidateAll();
                      },
                      onError: () => toast({ title: "Re-blueprint failed", variant: "destructive" }),
                    },
                  )
                }
                disabled={reblueprint.isPending}
                className="gap-2"
              >
                <Wand2 className="w-3 h-3" /> Adopt source schema
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Change Log</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filter ?? "all"} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All changes</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="changed">Changed</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                  <SelectItem value="unchanged">Unchanged</SelectItem>
                </SelectContent>
              </Select>
              {run.status !== "rolled_back" && run.status !== "drift_paused" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyAll.mutate(
                        { id: crmId, runId: syncRunId },
                        {
                          onSuccess: (r) => {
                            toast({ title: `Applied ${r.applied} changes` });
                            invalidateAll();
                          },
                        },
                      )
                    }
                    disabled={applyAll.isPending}
                    className="gap-1"
                  >
                    <Check className="w-3 h-3" /> Apply all pending
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      rejectAll.mutate(
                        { id: crmId, runId: syncRunId },
                        {
                          onSuccess: (r) => {
                            toast({ title: `Rejected ${r.rejected} changes` });
                            invalidateAll();
                          },
                        },
                      )
                    }
                    disabled={rejectAll.isPending}
                    className="gap-1"
                  >
                    <X className="w-3 h-3" /> Reject all pending
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (!window.confirm("Roll back this sync? Applied inserts/updates/deletes will be reversed.")) return;
                      rollback.mutate(
                        { id: crmId, runId: syncRunId },
                        {
                          onSuccess: (r) => {
                            toast({ title: `Reversed ${r.reversed} changes` });
                            invalidateAll();
                          },
                          onError: () => toast({ title: "Rollback failed", variant: "destructive" }),
                        },
                      );
                    }}
                    disabled={rollback.isPending}
                    className="gap-1"
                  >
                    <Undo2 className="w-3 h-3" /> Roll back
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {changesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !changesData || changesData.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No changes to show.</p>
          ) : (
            <div className="space-y-2">
              {changesData.changes.map((ch) => (
                <div
                  key={ch.id}
                  className="border border-border rounded-md p-3 text-sm space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={
                      ch.changeType === "new" ? "default" :
                      ch.changeType === "removed" ? "destructive" :
                      ch.changeType === "changed" ? "secondary" : "outline"
                    }>{ch.changeType}</Badge>
                    {ch.hasConflicts && <Badge variant="destructive">conflict</Badge>}
                    <Badge variant="outline">{ch.decision}</Badge>
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {ch.identityKey || `record #${ch.recordId ?? "?"}`}
                    </span>
                    <div className="flex-1" />
                    {ch.decision === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            decide.mutate(
                              {
                                id: crmId, runId: syncRunId, changeId: ch.id,
                                data: { decision: "approved" },
                              },
                              { onSuccess: invalidateAll },
                            )
                          }
                          className="gap-1 h-7"
                        >
                          <Check className="w-3 h-3" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            decide.mutate(
                              {
                                id: crmId, runId: syncRunId, changeId: ch.id,
                                data: { decision: "rejected" },
                              },
                              { onSuccess: invalidateAll },
                            )
                          }
                          className="gap-1 h-7"
                        >
                          <X className="w-3 h-3" /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                  {ch.fieldDiffs.length > 0 && (
                    <div className="border border-border rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-secondary/40 text-left">
                          <tr>
                            <th className="px-2 py-1 font-medium">Field</th>
                            <th className="px-2 py-1 font-medium">Local / Old</th>
                            <th className="px-2 py-1 font-medium">From Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ch.fieldDiffs.map((fd, i) => (
                            <tr key={i} className={fd.conflictWithLocal ? "bg-destructive/10" : ""}>
                              <td className="px-2 py-1 font-mono">{fd.field}</td>
                              <td className="px-2 py-1 text-muted-foreground">{formatVal(fd.oldValue)}</td>
                              <td className="px-2 py-1">{formatVal(fd.newValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {ch.changeType === "new" && ch.newData && (
                    <pre className="text-xs bg-secondary/30 rounded p-2 overflow-x-auto">
                      {JSON.stringify(ch.newData, null, 2)}
                    </pre>
                  )}
                  {ch.changeType === "removed" && ch.oldData && (
                    <pre className="text-xs bg-secondary/30 rounded p-2 overflow-x-auto">
                      {JSON.stringify(ch.oldData, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              {changesData.total > changesData.changes.length && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Showing {changesData.changes.length} of {changesData.total}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "muted" | "warn" | "danger" }) {
  const toneClass = {
    success: "text-emerald-500",
    info: "text-primary",
    muted: "text-muted-foreground",
    warn: "text-amber-500",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
