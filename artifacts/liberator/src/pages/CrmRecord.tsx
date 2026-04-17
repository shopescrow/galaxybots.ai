import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetCrm,
  getGetCrmQueryKey,
  useGetCrmRecord,
  getGetCrmRecordQueryKey,
  useUpdateCrmRecord,
  useDeleteCrmRecord,
  useListRelatedRecords,
  getListRelatedRecordsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Trash2, AlertTriangle, Shield, FileSearch, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RecordEditor } from "@/components/crm/RecordEditor";

export function CrmRecord() {
  const { id, entity, recordId } = useParams();
  const crmId = parseInt(id || "0", 10);
  const recId = parseInt(recordId || "0", 10);
  const entityName = entity || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: crmData } = useGetCrm(crmId, {
    query: { enabled: !!crmId, queryKey: getGetCrmQueryKey(crmId) },
  });

  const { data: record, isLoading } = useGetCrmRecord(crmId, entityName, recId, {
    query: { enabled: !!crmId && !!recId, queryKey: getGetCrmRecordQueryKey(crmId, entityName, recId) },
  });

  const update = useUpdateCrmRecord();
  const del = useDeleteCrmRecord();

  const { data: related } = useListRelatedRecords(crmId, entityName, recId, {
    query: {
      enabled: !!crmId && !!recId && !!entityName,
      queryKey: getListRelatedRecordsQueryKey(crmId, entityName, recId),
    },
  });

  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (record) setDraft(record.data as Record<string, unknown>);
  }, [record?.id]);

  if (isLoading || !crmData || !record) {
    return <Skeleton className="h-64 w-full max-w-3xl mx-auto" />;
  }

  const ent = crmData.crm.definition.entities.find((e) => e.name === entityName);
  if (!ent) return <div>Entity not found</div>;

  const primary = ent.primaryDisplayField;
  const title = primary && draft[primary] ? String(draft[primary]) : `Record #${record.id}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/crms/${crmId}/${entityName}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-3">
            <ArrowLeft className="w-4 h-4" /> {ent.label}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record #{record.id} · Created {new Date(record.createdAt).toLocaleString()}
          </p>
        </div>
        <Button
          variant="destructive"
          size="icon"
          onClick={() => {
            if (!confirm("Delete this record?")) return;
            del.mutate(
              { id: crmId, entity: entityName, recordId: record.id },
              {
                onSuccess: () => {
                  toast({ title: "Record deleted" });
                  qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crmId) });
                  setLocation(`/crms/${crmId}/${entityName}`);
                },
              },
            );
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {(() => {
        const r = record as typeof record & {
          needsReview?: boolean;
          warnings?: { field?: string | null; code: string; message: string; severity: string }[];
          provenance?: {
            sourceJobId?: number;
            sourcePageId?: number;
            pageNumber?: number;
            confidence?: Record<string, number>;
            region?: { x: number; y: number; w: number; h: number } | null;
            regions?: Record<string, { x: number; y: number; w: number; h: number }>;
          };
        };
        const provenance = r.provenance ?? {};
        const warnings = r.warnings ?? [];
        const confidence = provenance.confidence ?? {};
        const regions = provenance.regions ?? {};
        const thumbBase = `/api/v1/liberator/crms/${crmId}/entities/${encodeURIComponent(entityName)}/records/${recId}/cells`;
        const hasProvenance = warnings.length > 0 || Object.keys(confidence).length > 0 || provenance.sourceJobId;
        if (!hasProvenance) return null;
        return (
          <Card className={`border-border ${r.needsReview ? "border-amber-500/40" : ""}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-4 h-4 text-primary" /> Provenance & data quality
                {r.needsReview && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-500 gap-1">
                    <AlertTriangle className="w-3 h-3" /> Needs review
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {provenance.sourceJobId && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileSearch className="w-3 h-3" />
                  Source job <span className="font-mono">#{provenance.sourceJobId}</span>
                  {provenance.pageNumber != null && <> · page {provenance.pageNumber}</>}
                  {provenance.sourcePageId != null && <> · capture <span className="font-mono">#{provenance.sourcePageId}</span></>}
                </div>
              )}
              {warnings.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Warnings ({warnings.length})</div>
                  <ul className="space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i} className={`text-xs ${w.severity === "error" ? "text-destructive" : "text-amber-500"}`}>
                        {w.field ? <span className="font-mono">{w.field}: </span> : null}{w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(confidence).length > 0 && (
                <div>
                  <div className="font-medium mb-1">Per-cell evidence</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(confidence).map(([k, v]) => {
                      const hasRegion = !!regions[k] || !!provenance.region;
                      return (
                        <div key={k} className="border border-border rounded p-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-mono text-muted-foreground truncate">{k}</div>
                            <div
                              className={`text-xs font-medium ${
                                v < 0.6 ? "text-amber-500" : v < 0.8 ? "text-foreground" : "text-emerald-500"
                              }`}
                            >
                              {Math.round(v * 100)}%
                            </div>
                          </div>
                          {provenance.sourcePageId && hasRegion && (
                            <img
                              src={`${thumbBase}/${encodeURIComponent(k)}/thumb`}
                              alt={`${k} region`}
                              className="border border-border rounded max-w-full max-h-24 object-contain bg-muted/30"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {related && related.length > 0 && (
        <div className="space-y-4">
          {related.map((group) => {
            const otherEntity = crmData.crm.definition.entities.find((e) => e.name === group.entityType);
            const otherPrimary = otherEntity?.primaryDisplayField;
            return (
              <Card key={`${group.entityType}.${group.fieldName}`} className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="w-4 h-4 text-primary" />
                    {group.entityLabel} for this {ent.label.toLowerCase()}
                    <Badge variant="outline" className="ml-auto">{group.records.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {group.records.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No related records.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {group.records.map((r) => {
                        const data = r.data as Record<string, unknown>;
                        const display = otherPrimary && data[otherPrimary]
                          ? String(data[otherPrimary])
                          : `Record #${r.id}`;
                        return (
                          <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                            <Link
                              href={`/crms/${crmId}/${group.entityType}/${r.id}`}
                              className="font-medium hover:text-primary truncate"
                            >
                              {display}
                            </Link>
                            <span className="text-xs text-muted-foreground font-mono">
                              {group.fieldName}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Edit Record</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecordEditor entity={ent} value={draft} onChange={setDraft} />
          <div className="flex justify-end">
            <Button
              disabled={update.isPending}
              onClick={() => {
                update.mutate(
                  { id: crmId, entity: entityName, recordId: record.id, data: { data: draft } },
                  {
                    onSuccess: () => {
                      toast({ title: "Record saved" });
                      qc.invalidateQueries({ queryKey: getGetCrmRecordQueryKey(crmId, entityName, record.id) });
                    },
                    onError: () => toast({ title: "Save failed", variant: "destructive" }),
                  },
                );
              }}
              className="gap-2"
            >
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
