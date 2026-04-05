import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CheckCircle2, Webhook, Zap } from "lucide-react";
import type { ProspectorStats } from "./types";

export function PirateMonsterProspectorCard({ pmStats }: { pmStats: ProspectorStats }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg">PirateMonster Prospector</CardTitle>
              <CardDescription>Autonomous B2B Lead Generation</CardDescription>
            </div>
          </div>
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-[10px] uppercase tracking-wider text-muted-foreground">
          <div className="space-y-1">
            <div>Dispatched</div>
            <div className="text-sm font-medium text-foreground">{pmStats.dispatched} Jobs</div>
          </div>
          <div className="space-y-1">
            <div>Received</div>
            <div className="text-sm font-medium text-foreground">{pmStats.received} Leads</div>
          </div>
          <div className="space-y-1">
            <div>Avg Confidence</div>
            <div className="text-sm font-medium text-foreground">{(pmStats.avgConfidence * 100).toFixed(0)}%</div>
          </div>
        </div>
        <div className="p-2 bg-muted/50 rounded text-[10px] flex items-center gap-2">
          <Webhook className="w-3 h-3 text-primary" />
          Last Webhook: {pmStats.lastWebhook ? format(new Date(pmStats.lastWebhook), "HH:mm:ss") : "Never"}
        </div>
      </CardContent>
      <div className="border-t bg-muted/30 p-3 flex justify-between">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          Webhook connection stable
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">View Logs</Button>
      </div>
    </Card>
  );
}
