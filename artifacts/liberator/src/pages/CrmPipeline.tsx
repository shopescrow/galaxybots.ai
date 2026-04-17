import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetCrm,
  getGetCrmQueryKey,
  useGetRebuildPipeline,
  getGetRebuildPipelineQueryKey,
  useStartRebuildPipeline,
  useUpdateRebuildRecipe,
  useUpdateRebuildClusters,
  useUpdateRebuildLinks,
  useCommitRebuildPipeline,
  useListTransforms,
  getListCrmsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Play, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Sparkles, Layers, Link2, Eye, Rocket,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  RebuildJob, PipelineRecipe, DedupCluster, DryRunRow, IdentityLink,
  CrmBlueprintDef, TransformDescriptor,
} from "@workspace/api-client-react";

const STAGES = [
  { key: "normalize", label: "Normalize", icon: Sparkles },
  { key: "dedupe", label: "Dedupe", icon: Layers },
  { key: "resolve", label: "Resolve identities", icon: Link2 },
  { key: "dryrun", label: "Dry-run", icon: Eye },
  { key: "commit", label: "Commit", icon: Rocket },
] as const;

function StageIcon({ status }: { status?: string }) {
  if (status === "running") return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-destructive" />;
  return <div className="w-4 h-4 rounded-full border border-muted-foreground/40" />;
}

export function CrmPipeline() {
  const { id } = useParams();
  const crmId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: crmData } = useGetCrm(crmId, {
    query: { enabled: !!crmId, queryKey: getGetCrmQueryKey(crmId) },
  });
  const { data: pipeData, isLoading } = useGetRebuildPipeline(crmId, {
    query: {
      enabled: !!crmId,
      queryKey: getGetRebuildPipelineQueryKey(crmId),
      refetchInterval: (q) => {
        const j = (q.state.data as { job?: RebuildJob } | undefined)?.job;
        return j?.status === "running" ? 1500 : false;
      },
    },
  });
  const { data: transforms } = useListTransforms();

  const start = useStartRebuildPipeline();
  const updateRecipe = useUpdateRebuildRecipe();
  const updateClusters = useUpdateRebuildClusters();
  const updateLinks = useUpdateRebuildLinks();
  const commit = useCommitRebuildPipeline();

  const job = pipeData?.job ?? null;
  const def = (crmData?.crm.definition as CrmBlueprintDef | undefined) ?? { entities: [] };

  const [recipe, setRecipe] = useState<PipelineRecipe | null>(null);
  const [clusterDecisions, setClusterDecisions] = useState<Record<string, "accepted" | "rejected">>({});
  const [linkDecisions, setLinkDecisions] = useState<Record<string, "accepted" | "rejected">>({});

  useEffect(() => {
    if (job?.recipe) setRecipe(job.recipe);
  }, [job?.id, job?.recipe]);

  const allClusters = (job?.dedupClusters ?? []) as DedupCluster[];
  const allLinks = (job?.identityLinks ?? []) as IdentityLink[];
  // Prefer the server-computed `dryRunRowsPreview` which already reflects
  // the current accepted dedup-cluster decisions — guarantees the preview
  // matches what commitPipeline will actually load.
  const dryRun = (((job as { dryRunRowsPreview?: DryRunRow[] } | undefined)?.dryRunRowsPreview) ??
    (job?.dryRunRows ?? [])) as DryRunRow[];
  const reviewCount = useMemo(() => dryRun.filter((r) => r.needsReview).length, [dryRun]);
  const dryRunByEntity = useMemo(() => {
    const m = new Map<string, DryRunRow[]>();
    for (const r of dryRun) {
      const arr = m.get(r.entityType) ?? [];
      arr.push(r);
      m.set(r.entityType, arr);
    }
    return m;
  }, [dryRun]);

  if (!crmId) return <div>Invalid CRM ID</div>;
  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetRebuildPipelineQueryKey(crmId) });
    qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crmId) });
    qc.invalidateQueries({ queryKey: getListCrmsQueryKey() });
  };

  const handleStart = () => {
    start.mutate({ id: crmId }, {
      onSuccess: () => { toast({ title: "Pipeline started" }); invalidate(); },
      onError: () => toast({ title: "Failed to start pipeline", variant: "destructive" }),
    });
  };

  const handleSaveRecipe = () => {
    if (!recipe) return;
    updateRecipe.mutate({ id: crmId, data: { recipe } }, {
      onSuccess: () => { toast({ title: "Recipe updated — re-running" }); invalidate(); },
      onError: () => toast({ title: "Failed to update recipe", variant: "destructive" }),
    });
  };

  const handleSaveClusters = () => {
    const updates = Object.entries(clusterDecisions).map(([id, status]) => ({ id, status }));
    if (updates.length === 0) return;
    updateClusters.mutate({ id: crmId, data: { clusters: updates } }, {
      onSuccess: () => { toast({ title: "Cluster decisions saved" }); setClusterDecisions({}); invalidate(); },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const handleSaveLinks = () => {
    const updates = Object.entries(linkDecisions).map(([id, status]) => ({ id, status }));
    if (updates.length === 0) return;
    updateLinks.mutate({ id: crmId, data: { links: updates } }, {
      onSuccess: () => { toast({ title: "Identity link decisions saved" }); setLinkDecisions({}); invalidate(); },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const handleCommit = () => {
    commit.mutate({ id: crmId }, {
      onSuccess: (r) => {
        toast({
          title: "Committed",
          description: `${r.recordsLoaded} records loaded · ${r.duplicatesDropped} duplicates dropped · ${r.needsReview} need review`,
        });
        invalidate();
        setLocation(`/crms/${crmId}`);
      },
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : "Commit failed";
        toast({ title: "Commit failed", description: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/crms/${crmId}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-3">
            <ArrowLeft className="w-4 h-4" /> Back to CRM
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Data Quality Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Normalize, dedupe, resolve, review, then commit — with a full audit trail.
          </p>
        </div>
        <div className="flex gap-2">
          {!job && (
            <Button onClick={handleStart} disabled={start.isPending} className="gap-2">
              <Play className="w-4 h-4" /> Start pipeline
            </Button>
          )}
          {job && (
            <Button variant="outline" onClick={handleStart} disabled={start.isPending || job.status === "running"} className="gap-2">
              <Play className="w-4 h-4" /> Re-run
            </Button>
          )}
        </div>
      </div>

      {!job && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No pipeline run yet. Click <strong>Start pipeline</strong> to begin.
        </CardContent></Card>
      )}

      {job && (
        <Card>
          <CardHeader><CardTitle>Stages</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {STAGES.map((s) => {
                const st = job.stages?.[s.key];
                const Icon = s.icon;
                return (
                  <div key={s.key} className={`border rounded-md p-3 ${job.currentStage === s.key ? "border-primary" : "border-border"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <StageIcon status={st?.status} />
                    </div>
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {st?.rowsOut != null ? `${st.rowsOut} rows` : "—"}
                      {st?.warnings ? ` · ${st.warnings} warn` : ""}
                    </div>
                    {st?.message && (
                      <div className="text-[10px] text-muted-foreground mt-1 truncate" title={st.message}>{st.message}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {job.errorMessage && (
              <div className="mt-3 text-sm text-destructive">{job.errorMessage}</div>
            )}
          </CardContent>
        </Card>
      )}

      {job && def.entities.length > 0 && recipe && (
        <Card>
          <CardHeader>
            <CardTitle>Transform recipe</CardTitle>
            <CardDescription>
              Applied per-field during the Normalize stage. Saving re-runs the pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {def.entities.map((ent) => (
              <div key={ent.name}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline">{ent.label || ent.name}</Badge>
                  <span className="text-xs text-muted-foreground">{ent.fields.length} fields</span>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Field</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Transforms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ent.fields.map((f) => {
                        const key = `${ent.name}.${f.name}`;
                        const fieldRecipe = recipe.fields[key] ?? recipe.fields[f.name] ?? { transforms: [] };
                        const candidates = (transforms ?? []).filter(
                          (t: TransformDescriptor) => t.appliesTo.includes(f.type),
                        );
                        return (
                          <tr key={f.name}>
                            <td className="px-3 py-2 font-mono text-xs">{f.name}</td>
                            <td className="px-3 py-2"><Badge variant="outline">{f.type}</Badge></td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {candidates.map((t: TransformDescriptor) => {
                                  const enabled = fieldRecipe.transforms.includes(t.id);
                                  return (
                                    <label key={t.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer ${enabled ? "bg-primary/10 border-primary/40" : "border-border"}`}>
                                      <Checkbox
                                        checked={enabled}
                                        onCheckedChange={(v) => {
                                          setRecipe((prev) => {
                                            if (!prev) return prev;
                                            const next: PipelineRecipe = JSON.parse(JSON.stringify(prev));
                                            const cur = next.fields[key]?.transforms ?? [];
                                            next.fields[key] = {
                                              transforms: v
                                                ? [...cur, t.id]
                                                : cur.filter((x) => x !== t.id),
                                            };
                                            return next;
                                          });
                                        }}
                                      />
                                      {t.label}
                                    </label>
                                  );
                                })}
                                {candidates.length === 0 && <span className="text-xs text-muted-foreground italic">No transforms for this type</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <Button onClick={handleSaveRecipe} disabled={updateRecipe.isPending} className="gap-2">
              Save & re-run
            </Button>
          </CardContent>
        </Card>
      )}

      {job && allClusters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Duplicate clusters ({allClusters.length})</CardTitle>
            <CardDescription>Accept to merge into the representative row; reject to keep all rows separate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {allClusters.map((c) => {
              const decision = clusterDecisions[c.id] ?? c.status;
              return (
                <div key={c.id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium">{c.signal}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.rowIds.length} rows · similarity {(c.similarity * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={decision === "accepted" ? "default" : "outline"}
                        onClick={() => setClusterDecisions((p) => ({ ...p, [c.id]: "accepted" }))}
                      >Merge</Button>
                      <Button
                        size="sm"
                        variant={decision === "rejected" ? "secondary" : "outline"}
                        onClick={() => setClusterDecisions((p) => ({ ...p, [c.id]: "rejected" }))}
                      >Keep separate</Button>
                    </div>
                  </div>
                  <pre className="text-xs bg-secondary/40 rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(c.preview, null, 2)}
                  </pre>
                </div>
              );
            })}
            {Object.keys(clusterDecisions).length > 0 && (
              <Button onClick={handleSaveClusters} disabled={updateClusters.isPending}>Save decisions</Button>
            )}
          </CardContent>
        </Card>
      )}

      {job && allLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Identity links ({allLinks.length})</CardTitle>
            <CardDescription>
              Cross-entity links proposed by FK overlap, shared identifiers, and vector similarity.
              Accepted links record an identity-resolution audit trail without merging records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {allLinks.slice(0, 50).map((l) => {
              const decision = linkDecisions[l.id] ?? l.status;
              return (
                <div key={l.id} className="border rounded-md p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.signal}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{l.fromEntityType}#{l.fromRowId}</span>
                      {" ↔ "}
                      <span className="font-mono">{l.toEntityType}#{l.toRowId}</span>
                      {" · "}
                      <span className="px-1.5 py-0.5 bg-secondary/60 rounded text-[10px]">{l.method}</span>
                      {" · "}
                      similarity {(l.similarity * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={decision === "accepted" ? "default" : "outline"}
                      onClick={() => setLinkDecisions((p) => ({ ...p, [l.id]: "accepted" }))}
                    >Link</Button>
                    <Button
                      size="sm"
                      variant={decision === "rejected" ? "secondary" : "outline"}
                      onClick={() => setLinkDecisions((p) => ({ ...p, [l.id]: "rejected" }))}
                    >Ignore</Button>
                  </div>
                </div>
              );
            })}
            {allLinks.length > 50 && (
              <div className="text-xs text-muted-foreground text-center">Showing first 50 of {allLinks.length} links</div>
            )}
            {Object.keys(linkDecisions).length > 0 && (
              <Button onClick={handleSaveLinks} disabled={updateLinks.isPending}>Save link decisions</Button>
            )}
          </CardContent>
        </Card>
      )}

      {job && dryRun.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Dry-run preview ({dryRun.length} rows across {dryRunByEntity.size} entit{dryRunByEntity.size === 1 ? "y" : "ies"})</CardTitle>
                <CardDescription>
                  {reviewCount > 0 ? (
                    <span className="text-amber-500 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {reviewCount} need review
                    </span>
                  ) : "All rows look clean"}
                </CardDescription>
              </div>
              <Button
                onClick={handleCommit}
                disabled={commit.isPending || job.status === "running" || job.status === "committed"}
                className="gap-2"
              >
                <Rocket className="w-4 h-4" />
                {job.status === "committed" ? "Committed" : "Commit"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {def.entities.map((ent) => {
              const rows = dryRunByEntity.get(ent.name) ?? [];
              if (rows.length === 0) return null;
              return (
                <div key={ent.name}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline">{ent.label || ent.name}</Badge>
                    <span className="text-xs text-muted-foreground">{rows.length} rows</span>
                  </div>
                  <div className="border rounded-md overflow-auto max-h-[400px]">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50 sticky top-0">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">#</th>
                          {ent.fields.slice(0, 6).map((f) => (
                            <th key={f.name} className="px-3 py-2 font-medium">{f.label}</th>
                          ))}
                          <th className="px-3 py-2 font-medium">Warnings</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.slice(0, 100).map((r) => (
                          <tr key={r.rowId} className={r.needsReview ? "bg-amber-500/5" : ""}>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.rowId}</td>
                            {ent.fields.slice(0, 6).map((f) => {
                              const v = r.data[f.name];
                              const conf = (r.provenance as { confidence?: Record<string, number> })?.confidence?.[f.name];
                              return (
                                <td key={f.name} className="px-3 py-2">
                                  <div className="text-xs">{v == null ? <span className="italic text-muted-foreground">—</span> : String(v)}</div>
                                  {conf != null && (
                                    <div className={`text-[10px] ${conf < 0.6 ? "text-amber-500" : "text-muted-foreground"}`}>
                                      {Math.round(conf * 100)}%
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-xs">
                              {r.warnings.length === 0 ? <span className="text-emerald-500">ok</span> : (
                                <div className="space-y-0.5">
                                  {r.warnings.slice(0, 2).map((w, i) => (
                                    <div key={i} className={w.severity === "error" ? "text-destructive" : "text-amber-500"} title={w.message}>
                                      {w.code}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 100 && (
                      <div className="text-xs text-muted-foreground text-center py-2">Showing first 100 of {rows.length} rows</div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
