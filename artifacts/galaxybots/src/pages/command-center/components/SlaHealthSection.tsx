import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { AlertTriangle, BarChart3, Loader2 } from "lucide-react";
import type { SlaBot } from "./types";

export function SlaHealthSection({ data, isLoading }: {
  data?: { overallComplianceRate: number; totalEvents: number; totalBreached: number; bots: SlaBot[] };
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || data.totalEvents === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="py-10 text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-tech text-muted-foreground">No SLA events recorded yet. Directives sent to bots will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  const underperforming = data.bots.filter((b) => b.status === "red");

  return (
    <div className="space-y-4">
      {underperforming.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {underperforming.map((bot) => (
              <p key={bot.botId} className="text-sm text-red-300">
                <Link href={`/bots/${bot.botId}`} className="font-medium hover:underline">{bot.botName}</Link>
                {" "}is underperforming SLA targets ({bot.complianceRate}% compliance) — review recent sessions.
              </p>
            ))}
          </div>
        </div>
      )}

      <Card className="border-border/40">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-tech">Platform SLA Overview (7d)</CardTitle>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${data.overallComplianceRate >= 95 ? "text-green-400" : data.overallComplianceRate >= 85 ? "text-yellow-400" : "text-red-400"}`}>
                {data.overallComplianceRate}%
              </span>
              <span className="text-xs text-muted-foreground">overall compliance</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {data.bots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No bot SLA data available.</p>
          ) : (
            <div className="space-y-2">
              {data.bots.map((bot) => (
                <Link key={bot.botId} href={`/bots/${bot.botId}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        bot.status === "green" ? "bg-green-400" : bot.status === "yellow" ? "bg-yellow-400" : "bg-red-400"
                      }`} />
                      <span className="text-sm truncate">{bot.botName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span>{bot.total} events</span>
                      <span>{bot.breached} breached</span>
                      <Badge
                        className={`text-xs ${
                          bot.status === "green"
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : bot.status === "yellow"
                            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            : "bg-red-500/20 text-red-400 border-red-500/30"
                        }`}
                      >
                        {bot.complianceRate}%
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
