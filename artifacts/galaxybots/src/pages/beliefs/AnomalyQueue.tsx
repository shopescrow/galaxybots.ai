import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Loader2,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api/v1${path}`; }

interface PendingBeliefUpdate {
  id: number;
  botId: number;
  clientId: number | null;
  existingBeliefId: number | null;
  proposedBeliefText: string;
  proposedConfidence: number;
  currentConfidence: number;
  confidenceDelta: number;
  triggerSource: string;
  corroborationCount: number;
  status: string;
  expiresAt: string;
  appliedAt: string | null;
  rejectedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export default function AnomalyQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: queue = [], isLoading } = useQuery<PendingBeliefUpdate[]>({
    queryKey: ["anomaly-queue"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/admin/beliefs/anomaly-queue"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load anomaly queue");
      return res.json() as Promise<PendingBeliefUpdate[]>;
    },
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(apiUrl(`/admin/beliefs/anomaly-queue/${id}/approve`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["anomaly-queue"] });
      toast({ title: "Belief update approved and applied" });
    },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(apiUrl(`/admin/beliefs/anomaly-queue/${id}/reject`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected via admin review" }),
      });
      if (!res.ok) throw new Error("Failed to reject");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["anomaly-queue"] });
      toast({ title: "Belief update rejected" });
    },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  const pending = queue.filter((u) => u.status === "pending");
  const resolved = queue.filter((u) => u.status !== "pending");

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="h-7 w-7 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold">Belief Anomaly Queue</h1>
            <p className="text-muted-foreground text-sm">
              Belief updates held because they exceed the 20% confidence shift threshold — requires corroboration or human review
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">{pending.length}</div>
              <div className="text-sm text-muted-foreground">Awaiting Review</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">
                {queue.filter((u) => u.status === "applied").length}
              </div>
              <div className="text-sm text-muted-foreground">Applied</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-gray-500">
                {queue.filter((u) => u.status === "rejected" || u.status === "soft_rejected").length}
              </div>
              <div className="text-sm text-muted-foreground">Rejected</div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading anomaly queue…
          </div>
        ) : pending.length === 0 && resolved.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
              <p className="font-medium">Queue is empty</p>
              <p className="text-muted-foreground text-sm mt-1">No belief updates are held for review</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div>
                <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" /> Pending Review ({pending.length})
                </h2>
                <div className="space-y-3">
                  {pending.map((update) => (
                    <Card key={update.id} className="border-yellow-200">
                      <CardContent className="py-4 px-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium mb-2">{update.proposedBeliefText}</p>

                            <div className="flex flex-wrap gap-2 mb-3">
                              <Badge variant="outline" className="text-xs">Bot #{update.botId}</Badge>
                              {update.clientId && <Badge variant="outline" className="text-xs">Client #{update.clientId}</Badge>}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${Number(update.confidenceDelta) >= 0.3 ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Δ {Math.round(Number(update.confidenceDelta) * 100)}%
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(update.currentConfidence * 100)}% → {Math.round(update.proposedConfidence * 100)}%
                              </span>
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>Source: <span className="font-medium">{update.triggerSource}</span></p>
                              <p>Expires: {format(new Date(update.expiresAt), "MMM d, yyyy")}</p>
                              <p>Corroboration: {update.corroborationCount} / 1 needed</p>
                              <p>Submitted: {formatDistanceToNow(new Date(update.createdAt))} ago</p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(update.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectMutation.mutate(update.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              className="border-red-300 text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {resolved.length > 0 && (
              <div>
                <h2 className="text-base font-semibold mb-3 text-muted-foreground">Recent History</h2>
                <div className="space-y-2">
                  {resolved.map((update) => (
                    <Card key={update.id} className="opacity-70">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {update.status === "applied" ? (
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          )}
                          <p className="text-sm flex-1 truncate">{update.proposedBeliefText}</p>
                          <Badge variant="outline" className="text-xs shrink-0">{update.status}</Badge>
                          {update.reviewNote && (
                            <span className="text-xs text-muted-foreground shrink-0">{update.reviewNote}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
