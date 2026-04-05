import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Shield } from "lucide-react";
import type { AuditEvent } from "./types";

export function KiloProCard({ auditStats }: { auditStats: { lastEvent: AuditEvent | null, count: number } }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg">KiloPro Compliance</CardTitle>
              <CardDescription>Enterprise Grade Audit & Governance</CardDescription>
            </div>
          </div>
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="text-muted-foreground font-medium">Last Audit Event</div>
            <div className="truncate">
              {auditStats.lastEvent ? auditStats.lastEvent.action : "No events"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground font-medium">Event Count (24h)</div>
            <div className="">{auditStats.count}</div>
          </div>
        </div>
      </CardContent>
      <div className="border-t bg-muted/30 p-3 flex justify-between">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Activity className="w-3 h-3 text-primary" />
          Real-time monitoring enabled
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">Configure</Button>
      </div>
    </Card>
  );
}
