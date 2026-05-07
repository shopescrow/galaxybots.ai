import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetCrm,
  getGetCrmQueryKey,
  useListCrmRecords,
  getListCrmRecordsQueryKey,
  useCreateCrmRecord,
  useDeleteCrmRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, ArrowUpDown, Download, Plus, Search, Trash2, Eye, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RecordEditor } from "@/components/crm/RecordEditor";

export function CrmEntity() {
  const { id, entity } = useParams();
  const crmId = parseInt(id || "0", 10);
  const entityName = entity || "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<string | null>(null);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const limit = 50;

  const { data: crmData, isLoading: crmLoading } = useGetCrm(crmId, {
    query: { enabled: !!crmId, queryKey: getGetCrmQueryKey(crmId) },
  });

  const queryParams = {
    search: search || undefined,
    sort: sort || undefined,
    order: sort ? order : undefined,
    limit,
    offset: page * limit,
    needsReview: needsReviewOnly ? true : undefined,
  };

  const { data: recordsPage, isLoading } = useListCrmRecords(crmId, entityName, queryParams, {
    query: { enabled: !!crmId && !!entityName, queryKey: getListCrmRecordsQueryKey(crmId, entityName, queryParams) },
  });

  const createRecord = useCreateCrmRecord();
  const deleteRecord = useDeleteCrmRecord();

  if (crmLoading) return <Skeleton className="h-64 w-full" />;
  if (!crmData) return <div>CRM not found</div>;

  const ent = crmData.crm.definition.entities.find((e) => e.name === entityName);
  if (!ent) return <div>Entity not found</div>;

  const displayFields = ent.fields.slice(0, 6);
  const total = recordsPage?.total ?? 0;
  const records = recordsPage?.records ?? [];

  const toggleSort = (fieldName: string) => {
    if (sort === fieldName) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(fieldName);
      setOrder("asc");
    }
    setPage(0);
  };

  const handleDownload = (format: "csv" | "json") => {
    const url = `${window.location.origin}/api/v1/liberator/crms/${crmId}/entities/${entityName}/export?format=${format}`;
    window.open(url, "_blank");
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCrmRecordsQueryKey(crmId, entityName, queryParams) });
    qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crmId) });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/crms/${crmId}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-3">
            <ArrowLeft className="w-4 h-4" /> {crmData.crm.name}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{ent.label}</h1>
          <p className="text-muted-foreground mt-1">{total.toLocaleString()} records</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (o) setDraft({}); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Record</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Record</DialogTitle>
                <DialogDescription>Add a new {ent.label.toLowerCase()} record.</DialogDescription>
              </DialogHeader>
              <RecordEditor entity={ent} value={draft} onChange={setDraft} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button
                  disabled={createRecord.isPending}
                  onClick={() => {
                    createRecord.mutate(
                      { id: crmId, entity: entityName, data: { data: draft } },
                      {
                        onSuccess: () => {
                          toast({ title: "Record created" });
                          setCreateOpen(false);
                          invalidate();
                        },
                        onError: () => toast({ title: "Create failed", variant: "destructive" }),
                      },
                    );
                  }}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2"><Download className="w-4 h-4" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDownload("csv")}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload("json")}>Export as JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-md flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Search ${ent.label.toLowerCase()}...`}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant={needsReviewOnly ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => { setNeedsReviewOnly((v) => !v); setPage(0); }}
            >
              <AlertTriangle className="w-3 h-3" />
              {needsReviewOnly ? "Showing review queue" : "Needs review only"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No records {search && "matching your search"}.
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    {displayFields.map((f) => (
                      <TableHead key={f.name} className="cursor-pointer select-none" onClick={() => toggleSort(f.name)}>
                        <span className="inline-flex items-center gap-1">
                          {f.label}
                          <ArrowUpDown className={`w-3 h-3 ${sort === f.name ? "text-primary" : "opacity-30"}`} />
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => {
                    const data = r.data as Record<string, unknown>;
                    const needsReview = (r as { needsReview?: boolean }).needsReview === true;
                    return (
                      <TableRow key={r.id} className={needsReview ? "bg-amber-500/5" : undefined}>
                        {displayFields.map((f, idx) => (
                          <TableCell key={f.name} className="text-sm max-w-[200px] truncate" title={String(data[f.name] ?? "")}>
                            <div className="flex items-center gap-2">
                              {idx === 0 && needsReview && (
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                              )}
                              <span className="truncate">
                                {data[f.name] === null || data[f.name] === undefined ? (
                                  <span className="text-muted-foreground italic">null</span>
                                ) : f.type === "boolean" ? (
                                  <Badge variant="outline">{String(data[f.name])}</Badge>
                                ) : (
                                  String(data[f.name])
                                )}
                              </span>
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="text-right space-x-1">
                          <Link href={`/crms/${crmId}/${entityName}/${r.id}`}>
                            <Button variant="ghost" size="icon"><Eye className="w-4 h-4" /></Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (!confirm("Delete this record?")) return;
                              deleteRecord.mutate(
                                { id: crmId, entity: entityName, recordId: r.id },
                                {
                                  onSuccess: () => { toast({ title: "Record deleted" }); invalidate(); },
                                  onError: () => toast({ title: "Delete failed", variant: "destructive" }),
                                },
                              );
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {total > limit && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <div className="text-muted-foreground">
                Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total.toLocaleString()}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
