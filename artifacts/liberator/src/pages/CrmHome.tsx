import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetCrm,
  getGetCrmQueryKey,
  useUpdateCrm,
  useCommitCrm,
  getListCrmsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Save, Database, Rocket, Plus, Trash2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CrmBlueprintDef, CrmEntityDef, CrmFieldDef } from "@workspace/api-client-react";

const FIELD_TYPES = ["string", "text", "number", "boolean", "date", "email", "url", "phone", "enum"] as const;
type FieldType = CrmFieldDef["type"];

export function CrmHome() {
  const { id } = useParams();
  const crmId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useGetCrm(crmId, {
    query: { enabled: !!crmId, queryKey: getGetCrmQueryKey(crmId) },
  });

  const update = useUpdateCrm();
  const commit = useCommitCrm();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bp, setBp] = useState<CrmBlueprintDef>({ entities: [] });

  useEffect(() => {
    if (data?.crm) {
      setName(data.crm.name);
      setDescription(data.crm.description ?? "");
      setBp(data.crm.definition);
    }
  }, [data?.crm?.id]);

  if (!crmId) return <div>Invalid CRM ID</div>;

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { crm, entityCounts } = data;
  const isDraft = crm.status === "draft";
  const countMap = new Map(entityCounts.map((e) => [e.entity, e.count]));

  const updateField = (entityIdx: number, fieldIdx: number, patch: Partial<CrmFieldDef>) => {
    setBp((prev) => {
      const next: CrmBlueprintDef = structuredClone(prev);
      next.entities[entityIdx].fields[fieldIdx] = {
        ...next.entities[entityIdx].fields[fieldIdx],
        ...patch,
      };
      return next;
    });
  };
  const removeField = (entityIdx: number, fieldIdx: number) => {
    setBp((prev) => {
      const next: CrmBlueprintDef = structuredClone(prev);
      next.entities[entityIdx].fields.splice(fieldIdx, 1);
      return next;
    });
  };
  const addField = (entityIdx: number) => {
    setBp((prev) => {
      const next: CrmBlueprintDef = structuredClone(prev);
      next.entities[entityIdx].fields.push({
        name: `field_${next.entities[entityIdx].fields.length + 1}`,
        label: "New Field",
        type: "string",
        required: false,
      });
      return next;
    });
  };
  const updateEntity = (entityIdx: number, patch: Partial<CrmEntityDef>) => {
    setBp((prev) => {
      const next: CrmBlueprintDef = structuredClone(prev);
      next.entities[entityIdx] = { ...next.entities[entityIdx], ...patch };
      return next;
    });
  };

  const handleSave = () => {
    update.mutate(
      { id: crmId, data: { name, description, definition: bp } },
      {
        onSuccess: () => {
          toast({ title: "Blueprint saved" });
          qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crmId) });
          qc.invalidateQueries({ queryKey: getListCrmsQueryKey() });
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      },
    );
  };

  const handleCommit = () => {
    // First save current edits, then commit
    update.mutate(
      { id: crmId, data: { name, description, definition: bp } },
      {
        onSuccess: () => {
          commit.mutate(
            { id: crmId },
            {
              onSuccess: (result) => {
                toast({ title: "CRM committed", description: `${result.recordsLoaded} records loaded` });
                qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crmId) });
                qc.invalidateQueries({ queryKey: getListCrmsQueryKey() });
              },
              onError: () => toast({ title: "Commit failed", variant: "destructive" }),
            },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/crms" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-3">
            <ArrowLeft className="w-4 h-4" /> All CRMs
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{crm.name}</h1>
            <Badge variant={isDraft ? "outline" : "default"}>{crm.status}</Badge>
          </div>
          {crm.description && <p className="text-muted-foreground mt-2">{crm.description}</p>}
        </div>

        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={update.isPending} className="gap-2">
                <Save className="w-4 h-4" /> Save Draft
              </Button>
              <Button onClick={handleCommit} disabled={update.isPending || commit.isPending} className="gap-2">
                <Rocket className="w-4 h-4" /> Commit & Load Data
              </Button>
            </>
          )}
          {!isDraft && (
            <Button variant="outline" onClick={handleCommit} disabled={commit.isPending} className="gap-2">
              <Rocket className="w-4 h-4" /> Re-commit
            </Button>
          )}
        </div>
      </div>

      {isDraft && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm">
            <strong className="text-amber-500">Draft mode:</strong> Review and adjust the inferred schema below.
            Click <span className="font-mono">Commit & Load Data</span> to load the source rows into the CRM record store.
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle>CRM Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="crm-name">Name</Label>
            <Input id="crm-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isDraft} />
          </div>
          <div>
            <Label htmlFor="crm-description">Description</Label>
            <Textarea id="crm-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isDraft} />
          </div>
        </CardContent>
      </Card>

      {bp.entities.map((entity, ei) => (
        <Card key={entity.name} className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  {entity.label}
                </CardTitle>
                <CardDescription>
                  Entity key: <span className="font-mono">{entity.name}</span> · {entity.fields.length} fields ·
                  {" "}{(countMap.get(entity.name) ?? 0).toLocaleString()} records
                </CardDescription>
              </div>
              {!isDraft && (
                <Link href={`/crms/${crmId}/${entity.name}`}>
                  <Button variant="secondary" className="gap-2">
                    Open Records <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isDraft && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Entity Label</Label>
                  <Input value={entity.label} onChange={(e) => updateEntity(ei, { label: e.target.value })} />
                </div>
                <div>
                  <Label>Primary Display Field</Label>
                  <Select
                    value={entity.primaryDisplayField ?? ""}
                    onValueChange={(v) => updateEntity(ei, { primaryDisplayField: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Pick a field" /></SelectTrigger>
                    <SelectContent>
                      {entity.fields.map((f) => (
                        <SelectItem key={f.name} value={f.name}>{f.label} ({f.name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Field Key</th>
                    <th className="px-3 py-2 font-medium">Label</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Required</th>
                    <th className="px-3 py-2 font-medium">Sample</th>
                    {isDraft && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entity.fields.map((f, fi) => (
                    <tr key={fi}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {isDraft ? (
                          <Input value={f.name} onChange={(e) => updateField(ei, fi, { name: e.target.value })} className="h-8 text-xs" />
                        ) : f.name}
                      </td>
                      <td className="px-3 py-2">
                        {isDraft ? (
                          <Input value={f.label} onChange={(e) => updateField(ei, fi, { label: e.target.value })} className="h-8" />
                        ) : f.label}
                      </td>
                      <td className="px-3 py-2">
                        {isDraft ? (
                          <Select value={f.type} onValueChange={(v) => updateField(ei, fi, { type: v as FieldType })}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <Badge variant="outline">{f.type}</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={f.required}
                          disabled={!isDraft}
                          onCheckedChange={(v) => updateField(ei, fi, { required: !!v })}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={JSON.stringify(f.sampleValues)}>
                        {f.sampleValues && f.sampleValues.length > 0 ? String(f.sampleValues[0]) : <span className="italic">—</span>}
                      </td>
                      {isDraft && (
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="icon" onClick={() => removeField(ei, fi)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isDraft && (
              <Button variant="outline" size="sm" onClick={() => addField(ei)} className="gap-2">
                <Plus className="w-3 h-3" /> Add Field
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {!isDraft && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" /> Live Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bp.entities.map((entity) => (
                <button
                  key={entity.name}
                  onClick={() => setLocation(`/crms/${crmId}/${entity.name}`)}
                  className="text-left border border-border rounded-md p-4 hover:bg-secondary/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{entity.label}</div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {(countMap.get(entity.name) ?? 0).toLocaleString()} records · {entity.fields.length} fields
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
