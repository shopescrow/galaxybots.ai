import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, Timer, XCircle } from "lucide-react";
import { useState } from "react";
import { formatTime, formatToolName, getSlaUrgency } from "./helpers";
import { BASE, type Approval } from "./types";

export function PendingApprovals({ approvals }: { approvals: Approval[] }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/governance/approvals/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Approval failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center", "approvals"] });
      setProcessingId(null);
    },
    onError: () => {
      setProcessingId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/governance/approvals/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Declined from Command Center" }),
      });
      if (!res.ok) throw new Error("Rejection failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center", "approvals"] });
      setProcessingId(null);
    },
    onError: () => {
      setProcessingId(null);
    },
  });

  if (approvals.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No pending approvals. All clear.</p>
      </div>
    );
  }

  const sorted = [...approvals].sort((a, b) => {
    const aDeadline = a.slaDeadline ? new Date(a.slaDeadline).getTime() : Infinity;
    const bDeadline = b.slaDeadline ? new Date(b.slaDeadline).getTime() : Infinity;
    return aDeadline - bDeadline;
  });

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {sorted.map((a) => {
        const sla = getSlaUrgency(a.slaDeadline, a.createdAt, a.isTimeSensitive);
        const isBreached = a.slaDeadline && new Date(a.slaDeadline).getTime() < Date.now();
        const borderColor = isBreached ? "border-red-500/40 bg-red-500/5" : a.isTimeSensitive ? "border-amber-500/30 bg-amber-500/5" : "border-amber-500/20 bg-amber-500/5";
        return (
          <div key={a.id} className={`p-4 rounded-xl border ${borderColor}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${isBreached ? "text-red-400" : "text-amber-400"}`} />
                  <span className="text-sm font-medium truncate">{formatToolName(a.toolName)}</span>
                  {a.isTimeSensitive && (
                    <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30 shrink-0">
                      TIME-SENSITIVE
                    </Badge>
                  )}
                </div>
                {a.botName && (
                  <p className="text-xs text-muted-foreground ml-6">Requested by {a.botName}</p>
                )}
                <div className="flex items-center gap-3 ml-6 mt-1">
                  <p className="text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {formatTime(a.createdAt)}
                  </p>
                  {sla.label && (
                    <p className={`text-xs font-medium flex items-center gap-1 ${sla.color}`}>
                      <Timer className="w-3 h-3" />
                      {sla.label}
                    </p>
                  )}
                </div>
                {a.slaDeadline && (
                  <div className="ml-6 mt-2">
                    <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sla.pct <= 10 ? "bg-red-500" : sla.pct <= 40 ? "bg-amber-500" : "bg-green-500"
                        }`}
                        style={{ width: `${sla.pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-tech h-8 text-green-400 border-green-500/30 hover:bg-green-500/10"
                  disabled={processingId === a.id}
                  onClick={() => {
                    setProcessingId(a.id);
                    approveMutation.mutate(a.id);
                  }}
                >
                  {processingId === a.id && approveMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-tech h-8 text-red-400 border-red-500/30 hover:bg-red-500/10"
                  disabled={processingId === a.id}
                  onClick={() => {
                    setProcessingId(a.id);
                    rejectMutation.mutate(a.id);
                  }}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
