import { Link, useParams } from "wouter";
import {
  useGetCrm,
  getGetCrmQueryKey,
  useListCrmSyncRuns,
  getListCrmSyncRunsQueryKey,
  useTriggerCrmSync,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  pending: "secondary",
  failed: "destructive",
  drift_paused: "outline",
  rolled_back: "outline",
};

export function SyncHistory() {
  const { id } = useParams();
  const crmId = parseInt(id || "0", 10);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: crmData } = useGetCrm(crmId, {
    query: { enabled: !!crmId, queryKey: getGetCrmQueryKey(crmId) },
  });
  const { data, isLoading } = useListCrmSyncRuns(
    crmId,
    {},
    { query: { enabled: !!crmId, queryKey: getListCrmSyncRunsQueryKey(crmId, {}) } },
  );
  const trigger = useTriggerCrmSync();

  if (!crmId) return <div>Invalid CRM ID</div>;

  const handleTrigger = () => {
    trigger.mutate(
      { id: crmId },
      {
        onSuccess: () => {
          toast({ title: "Sync started" });
          qc.invalidateQueries({ queryKey: getListCrmSyncRunsQueryKey(crmId, {}) });
        },
        onError: (err) => {
          const msg = (err as { error?: string } | undefined)?.error ?? "Sync failed to start";
          toast({ title: "Sync failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/crms/${crmId}`}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back to CRM
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-7 h-7 text-primary" />
            Sync History
          </h1>
          {crmData?.crm && (
            <p className="text-muted-foreground mt-2">
              {crmData.crm.name} · {crmData.crm.recordCount.toLocaleString()} records
            </p>
          )}
        </div>
        <Button onClick={handleTrigger} disabled={trigger.isPending} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${trigger.isPending ? "animate-spin" : ""}`} />
          Sync Now
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data || data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No sync runs yet. Click "Sync Now" to perform your first re-extraction.
            </p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Started</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Trigger</th>
                    <th className="px-3 py-2 font-medium text-right">New</th>
                    <th className="px-3 py-2 font-medium text-right">Changed</th>
                    <th className="px-3 py-2 font-medium text-right">Removed</th>
                    <th className="px-3 py-2 font-medium text-right">Conflicts</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.runs.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 text-xs">
                        {new Date(r.startedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.triggeredBy}</td>
                      <td className="px-3 py-2 text-right">{r.totals.new}</td>
                      <td className="px-3 py-2 text-right">{r.totals.changed}</td>
                      <td className="px-3 py-2 text-right text-amber-500">{r.totals.removed}</td>
                      <td className="px-3 py-2 text-right text-destructive">{r.totals.conflicts}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/crms/${crmId}/syncs/${r.id}`}>
                          <Button size="sm" variant="ghost">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
