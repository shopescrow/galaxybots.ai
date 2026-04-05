import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatTime } from "./helpers";
import type { Alert } from "./types";

export function AlertsSection({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No alerts. All systems operational.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded-xl border ${
            alert.runStatus === "failed"
              ? "border-red-500/20 bg-red-500/5"
              : "border-amber-500/20 bg-amber-500/5"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                alert.runStatus === "failed" ? "text-red-400" : "text-amber-400"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{alert.botName}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] ${
                    alert.runStatus === "failed"
                      ? "text-red-400 border-red-500/30"
                      : "text-amber-400 border-amber-500/30"
                  }`}
                >
                  {alert.runStatus.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {alert.summary}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatTime(alert.createdAt)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
