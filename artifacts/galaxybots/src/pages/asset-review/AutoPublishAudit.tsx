import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2,
  History,
  Undo2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AutoPublishLogEntry } from "@/lib/asset-fetch";
import { useAutoPublishAudit, useRollbackAutoPublish } from "./useReviewData";
import { ConfidenceBadge } from "./helpers";

export function AutoPublishAudit() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"active" | "rolled-back" | "all">("active");
  const rolledBack =
    tab === "active" ? false : tab === "rolled-back" ? true : undefined;
  const { data, isLoading } = useAutoPublishAudit(rolledBack);
  const rollback = useRollbackAutoPublish();

  const [target, setTarget] = useState<AutoPublishLogEntry | null>(null);
  const [reason, setReason] = useState("");

  async function confirmRollback() {
    if (!target) return;
    try {
      await rollback.mutateAsync({ id: target.id, reason: reason.trim() || undefined });
      toast({
        title: "Rolled back",
        description: `"${target.assetTitle}" returned to ${target.previousStatus ?? "in_review"}.`,
      });
      setTarget(null);
      setReason("");
    } catch (err) {
      toast({
        title: "Rollback failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const entries = data ?? [];

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="font-tech">
          <TabsTrigger value="active">Auto-published</TabsTrigger>
          <TabsTrigger value="rolled-back">Rolled back</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground font-tech">
            <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
            No auto-published assets in this view yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-3"
            >
              <div className="flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">
                    {e.assetTitle}
                  </span>
                  <Badge variant="outline" className="text-[9px] uppercase font-tech">
                    {e.assetType.replace(/_/g, " ")}
                  </Badge>
                  {e.targetPlatform && (
                    <Badge variant="outline" className="text-[9px] font-tech text-muted-foreground">
                      {e.targetPlatform}
                    </Badge>
                  )}
                  <ConfidenceBadge score={e.confidenceScore} />
                  {e.rolledBack ? (
                    <Badge className="text-[9px] font-tech bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
                      <Undo2 className="w-3 h-3" /> rolled back
                    </Badge>
                  ) : (
                    <Badge className="text-[9px] font-tech bg-green-500/15 text-green-400 border-green-500/30 gap-1">
                      <CheckCircle2 className="w-3 h-3" /> live
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-tech">
                  <span>threshold {e.thresholdUsed}%</span>
                  <span>compliance {e.complianceStatus}</span>
                  <span>{new Date(e.createdAt).toLocaleString()}</span>
                  {e.rolledBack && e.rollbackReason && (
                    <span className="text-amber-400">reason: {e.rollbackReason}</span>
                  )}
                </div>
              </div>
              {!e.rolledBack && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                  onClick={() => {
                    setTarget(e);
                    setReason("");
                  }}
                  disabled={e.assetId == null}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Roll back
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back auto-publish</DialogTitle>
            <DialogDescription>
              {target
                ? `"${target.assetTitle}" will be unpublished and returned to ${target.previousStatus ?? "in_review"} for another look.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="font-tech text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmRollback} disabled={rollback.isPending}>
              {rollback.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-1" />
              )}
              Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
