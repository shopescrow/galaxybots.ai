import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Key, Copy, Activity, Loader2, Terminal } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import type { DevKey } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function McpGuideSection() {
  const { user } = useAuth();
  const mcpUrl = `${window.location.origin}/__mcp/sse`;
  const queryClient = useQueryClient();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const { data: keys } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const generateMcpKey = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: "MCP Client", scopes: ["read"] }),
      });
      if (!res.ok) throw new Error("Failed to generate key");
      return res.json() as Promise<{ apiKey: string }>;
    },
    onSuccess: (data) => {
      setGeneratedKey(data.apiKey);
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
    },
  });

  const activeKeys = keys?.filter(k => k.status === "active") || [];
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const selectedKey = selectedKeyId !== null ? activeKeys.find(k => k.id === selectedKeyId) : null;
  const keyPlaceholder = generatedKey ?? "YOUR_API_KEY";
  const hasRealKey = !!generatedKey;


  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">MCP Connection Guide</h2>
      <p className="text-sm text-muted-foreground">
        The Model Context Protocol (MCP) lets AI assistants use GalaxyBots tools directly.
        Connect Claude Desktop, Cursor, Windsurf, or any MCP-compatible client.
      </p>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
            Your MCP Server
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">SSE Endpoint:</Label>
            <code className="text-xs font-mono bg-secondary/80 px-2 py-1 rounded">{mcpUrl}</code>
          </div>
          {user && !hasRealKey && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-xs text-primary font-semibold">Get a ready-to-paste config</p>
              {activeKeys.length > 0 && !generatedKey && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Select an existing key to use in the snippets below, or generate a new dedicated MCP key:</p>
                  <div className="flex gap-2 flex-wrap">
                    {activeKeys.map(k => (
                      <Button
                        key={k.id}
                        size="sm"
                        variant={selectedKeyId === k.id ? "default" : "outline"}
                        onClick={() => { setSelectedKeyId(k.id); }}
                        className="text-xs"
                      >
                        {k.label || k.keyPrefix + "..."}
                      </Button>
                    ))}
                  </div>
                  {selectedKey && (
                    <p className="text-xs text-amber-400">Selected: <span className="font-mono">{selectedKey.keyPrefix}...</span> — full key value was shown once at creation. If you no longer have it, generate a new key.</p>
                  )}
                </div>
              )}
              <Button
                size="sm"
                onClick={() => generateMcpKey.mutate()}
                disabled={generateMcpKey.isPending}
                className="shrink-0"
              >
                {generateMcpKey.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Key className="w-4 h-4 mr-1" />}
                Generate New MCP Key
              </Button>
            </div>
          )}
          {hasRealKey && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
              <p className="text-xs text-green-400 font-semibold mb-1">Key generated — copy your config below</p>
              <p className="text-xs text-muted-foreground font-mono break-all">{generatedKey}</p>
              <p className="text-xs text-muted-foreground mt-1">Save this key — it won't be shown again.</p>
            </div>
          )}
          {!user && (
            <p className="text-xs text-muted-foreground">Sign in and create a key in the My Keys tab to get started.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Claude Desktop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add this to your <code className="bg-secondary/80 px-1 py-0.5 rounded">claude_desktop_config.json</code>
            {!hasRealKey && " (generate a key above to auto-fill your credentials)"}:
          </p>
          <CodeBlock language="json" code={JSON.stringify({
            mcpServers: {
              galaxybots: {
                transport: "sse",
                url: mcpUrl,
                headers: {
                  Authorization: `Bearer ${keyPlaceholder}`
                }
              }
            }
          }, null, 2)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const config = JSON.stringify({ mcpServers: { galaxybots: { transport: "sse", url: mcpUrl, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2);
                navigator.clipboard.writeText(config);
              }}
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy Config
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const t0 = Date.now();
                try {
                  const healthUrl = mcpUrl.replace("/sse", "/health");
                  const res = await fetch(healthUrl);
                  const rtt = Date.now() - t0;
                  if (res.ok) alert(`Connection successful — MCP server reachable (${rtt}ms RTT)`);
                  else alert(`Connection failed: HTTP ${res.status} (${rtt}ms)`);
                } catch {
                  alert("Connection failed — MCP server may be offline");
                }
              }}
            >
              <Activity className="w-3 h-3 mr-1" />
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Cursor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Add this to your <code className="bg-secondary/80 px-1 py-0.5 rounded">.cursor/mcp.json</code>:
          </p>
          <CodeBlock language="json" code={JSON.stringify({
            mcpServers: {
              galaxybots: {
                url: mcpUrl,
                headers: {
                  Authorization: `Bearer ${keyPlaceholder}`
                }
              }
            }
          }, null, 2)} />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Windsurf / Other MCP Clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            For any SSE-compatible MCP client, use these connection details:
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-24">Transport:</span>
              <code className="font-mono bg-secondary/80 px-2 py-1 rounded">SSE</code>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-24">URL:</span>
              <code className="font-mono bg-secondary/80 px-2 py-1 rounded">{mcpUrl}</code>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-24">Auth Header:</span>
              <code className="font-mono bg-secondary/80 px-2 py-1 rounded">Bearer {keyPlaceholder}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5 border">
        <CardContent className="p-4">
          <h3 className="text-sm font-bold mb-2">Available MCP Tools</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {[
              { name: "list_bots", desc: "List all available AI bots" },
              { name: "get_bot", desc: "Get details of a specific bot" },
              { name: "create_task_session", desc: "Deploy a bot team on a mission" },
              { name: "list_task_sessions", desc: "View active task sessions" },
              { name: "memory_search", desc: "Search bot memories semantically" },
              { name: "send_email", desc: "Send emails through bot actions" },
              { name: "web_search", desc: "Search the web for information" },
              { name: "http_fetch", desc: "Fetch data from external URLs" },
            ].map((tool) => (
              <div key={tool.name} className="flex items-center gap-2 p-2 rounded bg-secondary/30">
                <Terminal className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="font-mono font-bold">{tool.name}</span>
                <span className="text-muted-foreground ml-auto truncate">{tool.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
