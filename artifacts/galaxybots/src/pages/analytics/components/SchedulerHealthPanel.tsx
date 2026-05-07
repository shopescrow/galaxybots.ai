import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SchedulerData } from "./types";

interface Props {
  scheduler: SchedulerData | undefined;
}

export function SchedulerHealthPanel({ scheduler }: Props) {
  const chartData = scheduler?.byStatus.map((s) => ({
    name: s.status,
    value: s.count,
  })) ?? [];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Scheduler Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="space-y-3">
            {chartData.map((s) => (
              <div key={s.name} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    s.name === "success" ? "bg-green-500" :
                    s.name === "failed" ? "bg-red-500" :
                    "bg-yellow-500"
                  }`} />
                  <span className="text-sm capitalize">{s.name}</span>
                </div>
                <Badge variant="secondary" className="font-mono">{s.value}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
            No scheduler data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
