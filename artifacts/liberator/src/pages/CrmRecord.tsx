import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetCrm,
  getGetCrmQueryKey,
  useGetCrmRecord,
  getGetCrmRecordQueryKey,
  useUpdateCrmRecord,
  useDeleteCrmRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
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
