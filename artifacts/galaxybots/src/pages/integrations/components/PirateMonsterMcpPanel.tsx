import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Activity, CheckCircle2, Copy, ExternalLink, Key, Loader2, RefreshCw, Shield, Trash2, Webhook, XCircle, Zap } from "lucide-react";
import { API_BASE, type McpKey, type McpStats } from "./types";

export function PirateMonsterMcpPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");

  const { data: keys = [] } = useQuery<McpKey[]>({
    queryKey: ["pm-mcp-keys"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/piratemonster/mcp-keys`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: stats } = useQuery<McpStats>({
    queryKey: ["pm-mcp-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/piratemonster/mcp-stats`);
      if (!res.ok) return { toolCallStats: [], totalCalls: 0, cacheHitRate: 0, activeWebhookCount: 0, pendingScanCount: 0 };
      return res.json();
    },
    refetchInterval: 30000,
  });

  const issueKeyMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await fetch(`${API_BASE}/integrations/piratemonster/mcp-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || undefined }),
      });
      if (!res.ok) throw new Error("Failed to issue key");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pm-mcp-keys"] });
      setNewKeyLabel("");
      navigator.clipboard.writeText(data.key);
      toast({
        title: "MCP Key Created",
        description: `Key copied to clipboard: ${data.key.slice(0, 12)}... Store it securely — it won't be shown again.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create MCP key.", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await fetch(`${API_BASE}/integrations/piratemonster/mcp-keys/${keyId}/revoke`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to revoke key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-mcp-keys"] });
      toast({ title: "Key Revoked" });
    },
  });

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const sseEndpoint = `${window.location.origin}/__mcp/sse`;
  const activeKeys = keys.filter((k) => k.status === "active");

  return (
    <Card className="border-purple-500/20 bg-purple-500/5">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/30">
          <Zap className="h-6 w-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">PirateMonster MCP</CardTitle>
            {activeKeys.length > 0 ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="h-3 w-3" /> {activeKeys.length} Active Key{activeKeys.length > 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" /> No Keys
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1">
            MCP tool server for AEO/SEO — connect external apps, AI agents, and developer tools via the Model Context Protocol.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-muted-foreground font-mono text-xs">SSE Endpoint</span>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono truncate">
              {sseEndpoint}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleCopy(sseEndpoint, "sse")}
            >
              {copied === "sse" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-background p-3 text-center">
              <Activity className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-bold">{stats.totalCalls}</div>
              <div className="text-xs text-muted-foreground">Calls (7d)</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <RefreshCw className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-bold">{stats.cacheHitRate}%</div>
              <div className="text-xs text-muted-foreground">Cache Hit</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <Webhook className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-bold">{stats.activeWebhookCount}</div>
              <div className="text-xs text-muted-foreground">Webhooks</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <Shield className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <div className="text-lg font-bold">{stats.pendingScanCount}</div>
              <div className="text-xs text-muted-foreground">Pending Scans</div>
            </div>
          </div>
        )}

        {stats && stats.toolCallStats.length > 0 && (
          <div>
            <span className="text-muted-foreground text-xs font-medium">Tool Calls (Last 7 Days)</span>
            <div className="mt-1 space-y-1">
              {stats.toolCallStats.map((s) => (
                <div key={s.toolName} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-background border border-border/30">
                  <code className="font-mono text-muted-foreground">{s.toolName}</code>
                  <div className="flex items-center gap-2">
                    <span>{s.count} calls</span>
                    {s.cachedCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{s.cachedCount} cached</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border/30 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Partner Keys</span>
          </div>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Key label (optional)"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button
              size="sm"
              onClick={() => issueKeyMutation.mutate(newKeyLabel)}
              disabled={issueKeyMutation.isPending}
            >
              {issueKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Issue Key"}
            </Button>
          </div>
          {keys.length > 0 && (
            <div className="space-y-1.5">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between text-xs px-3 py-2 rounded bg-background border border-border/30">
                  <div className="flex items-center gap-2">
                    <Badge variant={k.status === "active" ? "default" : "secondary"} className={`text-[10px] ${k.status === "active" ? "bg-green-600" : "bg-red-600"}`}>
                      {k.status}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{k.label || `Key #${k.id}`}</span>
                    <span className="text-muted-foreground">({k.rateLimit}/hr)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</span>
                    {k.status === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => revokeKeyMutation.mutate(k.id)}
                        disabled={revokeKeyMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            External tools connect via SSE with a partner key as Bearer token.
          </p>
          <Link href="/clients">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
              <ExternalLink className="w-3.5 h-3.5" />
              AEO Intelligence
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
