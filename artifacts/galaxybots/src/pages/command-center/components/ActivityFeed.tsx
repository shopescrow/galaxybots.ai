import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Activity, Clock, ExternalLink } from "lucide-react";
import { formatTime, SEVERITY_ICON } from "./helpers";
import type { UnifiedActivityEvent } from "./types";

export function ActivityFeed({ items }: { items: UnifiedActivityEvent[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No recent activity recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
        >
          <div className="mt-0.5 shrink-0">
            {SEVERITY_ICON[item.severity] ?? <Activity className="w-3.5 h-3.5 text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm truncate">{item.description}</p>
              {item.link && (
                <Link href={item.link}>
                  <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground shrink-0" />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatTime(item.timestamp)}
              <Badge variant="secondary" className="text-[9px]">
                {item.source}
              </Badge>
              {item.clientName && (
                <span className="truncate">{item.clientName}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
