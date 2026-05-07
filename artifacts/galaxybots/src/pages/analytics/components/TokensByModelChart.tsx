import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CustomTooltip } from "./CustomTooltip";
import type { TokenData } from "./types";

interface Props {
  tokens: TokenData | undefined;
}

export function TokensByModelChart({ tokens }: Props) {
  const chartData = tokens?.tokensByModel.map((m) => ({
    model: m.model.replace("gpt-", ""),
    prompt: m.promptTokens,
    completion: m.completionTokens,
  })) ?? [];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Tokens by Model
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="model" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="prompt" stackId="a" fill="hsl(var(--primary))" name="Prompt" radius={[0, 0, 0, 0]} />
              <Bar dataKey="completion" stackId="a" fill="hsl(var(--chart-2, 173 58% 39%))" name="Completion" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm font-tech">
            No token data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
