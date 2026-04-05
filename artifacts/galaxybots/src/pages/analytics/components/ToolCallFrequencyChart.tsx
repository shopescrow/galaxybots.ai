import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CustomTooltip } from "./CustomTooltip";
import type { ToolData } from "./types";

interface Props {
  tools: ToolData | undefined;
}

export function ToolCallFrequencyChart({ tools }: Props) {
  const chartData = tools?.toolFrequency.slice(0, 10).map((t) => ({
    name: t.toolName.length > 15 ? t.toolName.substring(0, 15) + "..." : t.toolName,
    fullName: t.toolName,
    calls: t.callCount,
  })) ?? [];

  return (
    <Card className="border-border/50 lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Tool Call Frequency
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={120} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Calls" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm font-tech">
            No tool activity data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
