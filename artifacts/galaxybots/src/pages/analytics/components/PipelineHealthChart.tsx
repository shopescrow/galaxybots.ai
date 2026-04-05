import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, type PipelineData } from "./types";

interface Props {
  pipelines: PipelineData | undefined;
}

export function PipelineHealthChart({ pipelines }: Props) {
  const chartData = pipelines?.byStatus.map((p) => ({
    name: p.status,
    value: p.count,
  })) ?? [];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Pipeline Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.name === "completed" ? "#10b981" :
                        entry.name === "failed" ? "#ef4444" :
                        entry.name === "running" ? "#6366f1" :
                        CHART_COLORS[i % CHART_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {chartData.map((p) => (
                <div key={p.name} className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">{p.name}: {p.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
            No pipeline data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
