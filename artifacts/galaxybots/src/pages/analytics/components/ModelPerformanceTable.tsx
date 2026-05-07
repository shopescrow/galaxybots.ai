import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SpendData } from "./types";

interface Props {
  spend: SpendData | undefined;
}

export function ModelPerformanceTable({ spend }: Props) {
  if (!spend?.spendByModel || spend.spendByModel.length === 0) return null;

  return (
    <Card className="border-border/50 mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Model Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Model</th>
                <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Calls</th>
                <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Prompt Tokens</th>
                <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Completion Tokens</th>
                <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Cost</th>
                <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {spend.spendByModel.map((m) => (
                <tr key={m.model} className="border-b border-border/20">
                  <td className="py-2 px-3 font-mono text-xs">{m.model}</td>
                  <td className="py-2 px-3 text-right">{m.callCount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">{m.promptTokens.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">{m.completionTokens.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-bold">${m.totalCost.toFixed(4)}</td>
                  <td className="py-2 px-3 text-right">{m.avgLatencyMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
