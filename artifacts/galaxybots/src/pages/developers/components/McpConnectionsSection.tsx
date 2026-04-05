import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { LoginGate } from "./LoginGate";
import type { McpStats, McpSessionsData } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function McpConnectionsSection() {
  const { user } = useAuth();
  const [pingResult, setPingResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [pinging, setPinging] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery<McpStats>({
    queryKey: ["developer", "mcp", "stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/mcp/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery<McpSessionsData>({
    queryKey: ["developer", "mcp", "sessions"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/mcp/sessions`, { credentials: "include" });
      if (!res.ok) return { sessions: [], count: 0 };
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  const testConnection = async () => {
    setPinging(true);
    const start = Date.now();
    try {
      const res = await fetch(`${window.location.origin}/__mcp/health`);
      const latency = Date.now() - start;
      setPingResult({ ok: res.ok, latency });
    } catch (err) {
      setPingResult({ ok: false, error: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setPinging(false);
    }
  };

  if (!user) {
    return (
      <LoginGate message="Sign in to view your MCP Connections dashboard." />
    );
  }

  const maxCalls = stats?.toolCallVolume.reduce((m, t) => Math.max(m, t.callCount), 1) ?? 1;
  const maxDaily = stats?.dailyVolume.reduce((m, d) => Math.max(m, d.callCount), 1) ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">MCP Connections</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { refetch(); refetchSessions(); }}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={testConnection}
            disabled={pinging}
          >
            {pinging ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wifi className="w-3 h-3 mr-1" />}
            Test Connection
          </Button>
        </div>
      </div>

      {pingResult && (
        <div className={`rounded-lg border p-3 ${pingResult.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          <div className="flex items-center gap-2 text-xs">
            {pingResult.ok ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            <span className="font-bold">
              {pingResult.ok ? `MCP server reachable — ${pingResult.latency}ms round-trip` : `Connection failed: ${pingResult.error}`}
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-tech uppercase">Tool Calls (7d)</p>
                <p className="text-2xl font-display font-bold">{stats.totalCallsLast7Days.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-tech uppercase">Active Sessions</p>
                <p className="text-2xl font-display font-bold">{sessionsData?.count ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-tech uppercase">OAuth Clients</p>
                <p className="text-2xl font-display font-bold">{stats.oauthClients.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground font-tech uppercase">Unique Tools Used</p>
                <p className="text-2xl font-display font-bold">{stats.toolCallVolume.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                Active SSE Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsData && sessionsData.sessions.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-[10px] font-tech text-muted-foreground uppercase px-2 pb-1 border-b border-border/30">
                    <span className="col-span-2">Client</span>
                    <span>Connected</span>
                    <span className="text-right">Calls</span>
                  </div>
                  {sessionsData.sessions.map((s) => (
                    <div key={s.sessionId} className="grid grid-cols-4 gap-2 text-xs px-2 py-1 rounded-md hover:bg-secondary/20">
                      <div className="col-span-2 space-y-0.5">
                        <div className="font-bold truncate">{s.clientName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{s.callerType}</div>
                      </div>
                      <div className="text-muted-foreground text-[10px] self-center">
                        {new Date(s.connectedAt).toLocaleTimeString()}
                      </div>
                      <div className="text-right self-center font-mono">{s.toolCallCount}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No active sessions. Connect a client via Claude Desktop, Cursor, or any MCP-compatible tool.
                </p>
              )}
            </CardContent>
          </Card>

          {stats.toolCallVolume.length > 0 && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                  Tool Call Volume (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2 text-[10px] font-tech text-muted-foreground uppercase px-2 pb-1 border-b border-border/30">
                    <span className="col-span-2">Tool</span>
                    <span className="text-right">Calls</span>
                    <span className="text-right">Errors</span>
                    <span className="text-right">Avg ms</span>
                  </div>
                  {stats.toolCallVolume.map((t) => (
                    <div key={t.toolName} className="space-y-1">
                      <div className="grid grid-cols-5 gap-2 text-xs px-2">
                        <span className="col-span-2 font-mono truncate">{t.toolName}</span>
                        <span className="text-right">{t.callCount}</span>
                        <span className={`text-right ${t.errorCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>{t.errorCount}</span>
                        <span className="text-right text-muted-foreground">{t.avgLatencyMs}ms</span>
                      </div>
                      <div className="px-2">
                        <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{ width: `${Math.min(100, (t.callCount / maxCalls) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stats.dailyVolume.length > 0 && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                  Daily Tool Calls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {stats.dailyVolume.map((d) => (
                    <div key={d.date} className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground font-mono w-24">{d.date}</span>
                      <div className="flex-1 h-4 bg-secondary/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gold/60 rounded-full"
                          style={{ width: `${Math.min(100, (d.callCount / maxDaily) * 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right">{d.callCount}</span>
                      {d.errorCount > 0 && (
                        <span className="text-red-400 text-[10px]">{d.errorCount} err</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stats.oauthClients.length > 0 && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                  OAuth Clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.oauthClients.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold">{c.clientName}</div>
                        <div className="font-mono text-muted-foreground text-[10px]">{c.clientId}</div>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {(c.allowedScopes as string[]).map(s => (
                          <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stats.toolCallVolume.length === 0 && stats.oauthClients.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No MCP activity in the last 7 days. Connect a client to get started.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
