import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, Calendar, FileText, BarChart3, CheckCircle2, XCircle, Loader2, Zap, Copy, Link2, ExternalLink, Key, Shield, Activity, Webhook, RefreshCw, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");


interface Integration {
  id: number;
  clientId: number;
  service: string;
  credential: string;
  status: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

const SERVICES = [
  {
    key: "gmail",
    name: "Gmail",
    description: "Send and read emails on behalf of the client using Gmail API.",
    icon: Mail,
    credentialLabel: "Gmail OAuth Access Token",
    credentialPlaceholder: "Paste your OAuth access token here...",
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    description: "Create and list calendar events using Google Calendar API.",
    icon: Calendar,
    credentialLabel: "Google Calendar OAuth Access Token",
    credentialPlaceholder: "Paste your OAuth access token here...",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    description: "Manage CRM contacts and deals using HubSpot private app token.",
    icon: BarChart3,
    credentialLabel: "HubSpot Private App Access Token",
    credentialPlaceholder: "pat-na1-xxxx-xxxx-xxxx...",
  },
  {
    key: "notion",
    name: "Notion",
    description: "Create and read documents/pages using Notion integration token.",
    icon: FileText,
    credentialLabel: "Notion Integration Token",
    credentialPlaceholder: "ntn_xxxxxxxxxxxx...",
  },
];

function IntegrationCard({
  service,
  existing,
  clientId,
}: {
  service: (typeof SERVICES)[number];
  existing: Integration | undefined;
  clientId: number;
}) {
  const [credential, setCredential] = useState("");
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, updateOnboarding } = useAuth();
  const Icon = service.icon;

  const saveMutation = useMutation({
    mutationFn: async (cred: string) => {
      const res = await fetch(`${API_BASE}/client-integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, service: service.key, credential: cred }),
      });
      if (!res.ok) throw new Error("Failed to save integration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-integrations", clientId] });
      setEditing(false);
      setCredential("");
      toast({ title: `${service.name} connected`, description: "Integration saved successfully." });
      if (user?.onboarding && !user.onboarding.integrations) {
        updateOnboarding({ integrations: true }).catch(() => {});
      }
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to connect ${service.name}.`, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const res = await fetch(`${API_BASE}/client-integrations/${clientId}/${existing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-integrations", clientId] });
      toast({ title: `${service.name} disconnected` });
    },
  });

  const isConnected = existing?.status === "connected";

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{service.name}</CardTitle>
            {isConnected ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" /> Not Connected
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1">{service.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isConnected && !editing ? (
          <div className="flex gap-2">
            <div className="flex-1 rounded bg-muted px-3 py-2 text-sm text-muted-foreground font-mono">
              ••••••••{existing.credential.slice(-8)}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Update
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={service.credentialPlaceholder}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              className="flex-1 font-mono text-sm"
            />
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(credential)}
              disabled={!credential.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Connect"
              )}
            </Button>
            {editing && (
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setCredential(""); }}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface McpKey {
  id: number;
  label: string | null;
  status: string;
  rateLimit: number;
  createdAt: string;
  revokedAt: string | null;
}

interface McpStats {
  toolCallStats: Array<{ toolName: string; count: number; cachedCount: number }>;
  totalCalls: number;
  cacheHitRate: number;
  activeWebhookCount: number;
  pendingScanCount: number;
}

function BingoLingoPanel() {
  const BINGOLINGO_API = `${import.meta.env.BASE_URL}../api/bingolingo`.replace(/\/\//g, "/");

  const { data: stats, isLoading, error: statsError } = useQuery<{
    clients: number;
    totalContent: number;
    published: number;
    drafts: number;
    totalViews: number;
  }>({
    queryKey: ["bingolingo-stats"],
    queryFn: async () => {
      const res = await fetch(`${BINGOLINGO_API}/dashboard-stats`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
      return res.json();
    },
    refetchInterval: 30000,
    retry: false,
  });

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Sparkles className="h-6 w-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">BingoLingo.ai</CardTitle>
            <Badge variant="default" className="gap-1 bg-green-600">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          </div>
          <CardDescription className="mt-1">
            AI-powered content intelligence platform — generate blog posts, social media content, email newsletters, case studies, and more.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : statsError ? (
          <p className="text-xs text-destructive py-2">{statsError.message}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.clients ?? 0}</div>
              <div className="text-xs text-muted-foreground">Clients</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.totalContent ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Content</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.published ?? 0}</div>
              <div className="text-xs text-muted-foreground">Published</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.totalViews ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Views</div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            First-party integration — no API key needed. Same authenticated session as GalaxyBots.
          </p>
          <a href="/bingolingo/">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
              <ArrowRight className="w-3.5 h-3.5" />
              Open BingoLingo
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function PirateMonsterMcpPanel() {
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

function PirateMonsterPanel() {
  const { data: config } = useQuery<{
    webhookUrl: string;
    recommendUrl: string;
    method: string;
    apiKeyHeader: string;
    inboundSecretConfigured: boolean;
    inboundSecretMasked: string | null;
    outboundKeyConfigured: boolean;
    engines: string[];
  }>({
    queryKey: ["piratemonster-config"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/piratemonster/config`);
      return res.json();
    },
  });

  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const isConnected = config?.inboundSecretConfigured && config?.outboundKeyConfigured;
  const isPartial = config?.inboundSecretConfigured || config?.outboundKeyConfigured;

  return (
    <Card className="border-purple-500/20 bg-purple-500/5">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/30">
          <Zap className="h-6 w-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">PirateMonster AEO</CardTitle>
            {isConnected ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : isPartial ? (
              <Badge variant="secondary" className="gap-1 bg-yellow-600">
                <Link2 className="h-3 w-3" /> Partial
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" /> Not Connected
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1">
            Real-time AEO intelligence from PirateMonster.com — scores your AI visibility across 9 answer engines.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground font-mono text-xs">Webhook URL</span>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono truncate">
                {config?.webhookUrl ?? "/api/integrations/piratemonster/webhook"}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleCopy(
                  `${window.location.origin}${config?.webhookUrl ?? "/api/integrations/piratemonster/webhook"}`,
                  "webhook"
                )}
              >
                {copied === "webhook" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-xs">API Key Header</span>
            <div className="mt-1">
              <code className="px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono">
                x-api-key
              </code>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-xs">Inbound Secret</span>
            <div className="mt-1">
              {config?.inboundSecretConfigured && config.inboundSecretMasked ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono">
                    {config.inboundSecretMasked}
                  </code>
                  <Badge variant="default" className="text-xs bg-green-600 shrink-0">Configured</Badge>
                </div>
              ) : (
                <>
                  <Badge variant="secondary" className="text-xs">Not Configured</Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Set PIRATEMONSTER_INBOUND_SECRET env variable
                  </p>
                </>
              )}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-xs">Outbound API Key</span>
            <div className="mt-1">
              <Badge variant={config?.outboundKeyConfigured ? "default" : "secondary"} className={`text-xs ${config?.outboundKeyConfigured ? "bg-green-600" : ""}`}>
                {config?.outboundKeyConfigured ? "Configured" : "Not Configured"}
              </Badge>
              {!config?.outboundKeyConfigured && (
                <p className="text-xs text-muted-foreground mt-1">
                  Set PIRATEMONSTER_API_KEY env variable
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            Configure the webhook URL and inbound secret in PirateMonster to start receiving AEO scan results.
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

export default function Integrations() {
  const [clientId, setClientId] = useState<number>(1);
  const { data: clients } = useQuery<Array<{ id: number; companyName: string }>>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/clients`);
      return res.json();
    },
  });

  useEffect(() => {
    if (clients && clients.length > 0 && !clients.find((c) => c.id === clientId)) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ["client-integrations", clientId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/client-integrations/${clientId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!clientId,
  });

  const integrationMap = new Map(integrations.map((i) => [i.service, i]));

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect your accounts so agents can perform actions on your behalf — send emails, manage calendar events, update CRM records, and create documents.
          </p>
        </div>

        {clients && clients.length > 1 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Client:</label>
            <select
              className="rounded border px-3 py-1.5 text-sm"
              value={clientId}
              onChange={(e) => setClientId(Number(e.target.value))}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="font-semibold text-sm mb-1">Platform-Level Integrations</h3>
          <p className="text-sm text-muted-foreground">
            Slack and Linear are shared across all clients and configured at the platform level via environment variables (SLACK_BOT_TOKEN, LINEAR_API_KEY). Contact your administrator to set these up.
          </p>
        </div>

        <BingoLingoPanel />

        <PirateMonsterMcpPanel />

        <PirateMonsterPanel />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4">
            {SERVICES.map((service) => (
              <IntegrationCard
                key={service.key}
                service={service}
                existing={integrationMap.get(service.key)}
                clientId={clientId}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
