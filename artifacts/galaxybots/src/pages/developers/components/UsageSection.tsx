import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoginGate } from "./LoginGate";
import type { DevKey, UsageData } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function UsageSection() {
  const { data: keys } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const activeKeys = keys?.filter(k => k.status === "active") || [];

  const effectiveKeyId = selectedKeyId ?? activeKeys[0]?.id ?? null;

  const { data: usage, isLoading } = useQuery<UsageData>({
    queryKey: ["developer", "usage", effectiveKeyId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys/${effectiveKeyId}/usage`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!effectiveKeyId,
  });

  return (
    <LoginGate message="Sign in to view your API key usage metrics and analytics.">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold">API Usage</h2>
          {activeKeys.length > 0 && (
            <Select
              value={String(effectiveKeyId ?? "")}
              onValueChange={(v) => setSelectedKeyId(Number(v))}
            >
              <SelectTrigger className="w-48 text-xs">
                <SelectValue placeholder="Select key" />
              </SelectTrigger>
              <SelectContent>
                {activeKeys.map((k) => (
                  <SelectItem key={k.id} value={String(k.id)}>
                    {k.label} ({k.keyPrefix}...)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!effectiveKeyId ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Create an API key first to view usage metrics.
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : usage ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Total Calls</p>
                  <p className="text-2xl font-display font-bold">{usage.totalCalls.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Rate Limit</p>
                  <p className="text-2xl font-display font-bold">{usage.rateLimit.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Remaining</p>
                  <p className="text-2xl font-display font-bold">{usage.rateLimitRemaining.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Last Used</p>
                  <p className="text-sm font-display font-bold">
                    {usage.lastUsedAt ? new Date(usage.lastUsedAt).toLocaleDateString() : "Never"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {usage.usageByEndpoint.length > 0 && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                    Usage by Endpoint (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="grid grid-cols-6 gap-2 text-[10px] font-tech text-muted-foreground uppercase px-2 pb-1 border-b border-border/30">
                      <span className="col-span-2">Endpoint</span>
                      <span className="text-right">Calls</span>
                      <span className="text-right">Errors</span>
                      <span className="text-right">Avg Latency</span>
                      <span className="text-right">Tokens</span>
                    </div>
                    {usage.usageByEndpoint.map((u, i) => (
                      <div key={i} className="grid grid-cols-6 gap-2 text-xs px-2 py-1.5 rounded hover:bg-secondary/50">
                        <span className="col-span-2 font-mono truncate">
                          <Badge variant="outline" className="text-[10px] mr-1">{u.method}</Badge>
                          {u.endpoint}
                        </span>
                        <span className="text-right">{u.callCount}</span>
                        <span className={`text-right ${u.errorCount > 0 ? "text-red-400" : ""}`}>{u.errorCount}</span>
                        <span className="text-right">{u.avgLatencyMs}ms</span>
                        <span className="text-right">{u.totalTokens.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {usage.usageOverTime.length > 0 && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                    Daily API Calls (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {usage.usageOverTime.map((d) => (
                      <div key={d.date} className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground font-mono w-24">{d.date}</span>
                        <div className="flex-1 h-4 bg-secondary/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{
                              width: `${Math.min(100, (d.callCount / Math.max(...usage.usageOverTime.map(x => x.callCount))) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="w-12 text-right">{d.callCount}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {usage.usageByEndpoint.length === 0 && usage.usageOverTime.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No usage data yet. Start making API calls to see metrics here.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </LoginGate>
  );
}
