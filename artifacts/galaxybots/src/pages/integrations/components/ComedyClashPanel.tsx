import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
  Webhook,
  XCircle,
  Zap,
  Radio,
} from "lucide-react";
import { API_BASE } from "./types";

interface CcApiKey {
  id: number;
  label: string | null;
  status: string;
  rateLimit: number;
  requestCount: number;
  createdAt: string;
  revokedAt: string | null;
}

interface CcConnection {
  id: number;
  apiBaseUrl: string;
  status: string;
  updatedAt: string;
}

interface CcWebhookSub {
  id: number;
  targetUrl: string;
  events: string[];
  status: string;
  updatedAt: string;
}

interface InboundEvent {
  id: number;
  eventType: string;
  status: string;
  sessionId: string | null;
  createdAt: string;
}

const ALL_EVENTS = [
  "session.completed",
  "session.failed",
  "bot.output_ready",
  "lead.qualified",
  "task.finished",
];

export function ComedyClashPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [ccApiBaseUrl, setCcApiBaseUrl] = useState("");
  const [ccApiKey, setCcApiKey] = useState("");

  const [whTargetUrl, setWhTargetUrl] = useState("");
  const [whSecret, setWhSecret] = useState("");
  const [whEvents, setWhEvents] = useState<string[]>(ALL_EVENTS);

  const { data: connection, isLoading: connLoading } = useQuery<CcConnection | null>({
    queryKey: ["cc-connection"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/connection`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: keys = [] } = useQuery<CcApiKey[]>({
    queryKey: ["cc-api-keys"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/api-keys`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: webhookSub } = useQuery<CcWebhookSub | null>({
    queryKey: ["cc-webhook-sub"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/webhook-subscription`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: inboundSecretStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["cc-inbound-secret-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/inbound-secret/status`);
      if (!res.ok) return { configured: false };
      return res.json();
    },
  });

  const inboundSecretConfigured = inboundSecretStatus?.configured ?? true;

  const { data: inboundEvents = [] } = useQuery<InboundEvent[]>({
    queryKey: ["cc-inbound-events"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/inbound-events`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: deliveryLog = [] } = useQuery<Array<{
    id: number;
    eventType: string;
    status: string;
    attemptCount: number;
    responseStatus: number | null;
    deliveredAt: string | null;
    createdAt: string;
  }>>({
    queryKey: ["cc-delivery-log"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/webhook-deliveries`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  const saveConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl: ccApiBaseUrl, apiKey: ccApiKey }),
      });
      if (!res.ok) throw new Error("Failed to save connection");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cc-connection"] });
      setCcApiKey("");
      toast({ title: "Connection saved", description: "ComedyClash credentials stored securely." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save connection.", variant: "destructive" }),
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/connection/test`, { method: "POST" });
      return res.json() as Promise<{ ok: boolean; message?: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: data.ok ? "Connection OK" : "Connection Failed",
        description: data.message || (data.ok ? "ComedyClash responded successfully." : "Could not reach ComedyClash."),
        variant: data.ok ? "default" : "destructive",
      });
    },
  });

  const issueKeyMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cc-api-keys"] });
      setNewKeyLabel("");
      navigator.clipboard.writeText(data.key);
      toast({
        title: "API Key Created",
        description: `Key copied: ${data.key.slice(0, 12)}... Store it securely — won't be shown again.`,
      });
    },
    onError: () => toast({ title: "Error", description: "Failed to create key.", variant: "destructive" }),
  });

  const rotateKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/api-keys/${keyId}/rotate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to rotate key");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cc-api-keys"] });
      navigator.clipboard.writeText(data.key);
      toast({ title: "Key Rotated", description: "New key copied to clipboard. Old key valid 24h." });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/api-keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke key");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cc-api-keys"] });
      toast({ title: "Key Revoked" });
    },
  });

  const saveWebhookMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/webhook-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: whTargetUrl, secret: whSecret, events: whEvents }),
      });
      if (!res.ok) throw new Error("Failed to save webhook");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cc-webhook-sub"] });
      setWhSecret("");
      toast({ title: "Webhook saved", description: "Outbound webhook subscription configured." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save webhook.", variant: "destructive" }),
  });

  const testPingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/webhook-subscription/test-ping`, { method: "POST" });
      return res.json() as Promise<{ ok: boolean; status?: number; message?: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: data.ok ? "Test Ping Delivered" : "Test Ping Failed",
        description: data.ok ? `HTTP ${data.status}` : (data.message || "Could not reach target URL."),
        variant: data.ok ? "default" : "destructive",
      });
    },
  });

  const toggleWebhookStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/webhook-subscription/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cc-webhook-sub"] }),
  });

  const regenerateInboundSecretMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/comedyclash/inbound-secret/regenerate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate secret");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cc-inbound-secret-status"] });
      navigator.clipboard.writeText(data.secret);
      toast({ title: "Secret Regenerated", description: "New inbound secret copied to clipboard. Configure it in ComedyClash." });
    },
    onError: () => toast({ title: "Error", description: "Failed to regenerate secret.", variant: "destructive" }),
  });

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const inboundWebhookUrl = `${window.location.origin}/api/integrations/comedyclash/inbound-webhook`;
  const isConnected = !!connection && connection.status === "active";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-base">🎭</div>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              ComedyClash Integration
              <Badge variant={isConnected ? "default" : "secondary"} className="text-xs">
                {isConnected ? "Connected" : "Not Connected"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Bilateral integration — CC calls GB bots; GB invokes CC tools and delivers webhook events.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="connection" className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-secondary/50">
            <TabsTrigger value="connection" className="text-xs gap-1"><Zap className="w-3 h-3" /> Connection</TabsTrigger>
            <TabsTrigger value="api-keys" className="text-xs gap-1"><Key className="w-3 h-3" /> API Keys</TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs gap-1"><Webhook className="w-3 h-3" /> Webhooks</TabsTrigger>
            <TabsTrigger value="inbound" className="text-xs gap-1">
              <Radio className="w-3 h-3" /> Inbound
              {!inboundSecretConfigured && (
                <AlertTriangle className="w-3 h-3 text-amber-500 ml-0.5" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connection" className="space-y-4">
            {connLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : (
              <>
                {connection && (
                  <div className="p-3 rounded-lg bg-secondary/40 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      {isConnected ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="font-medium">{connection.apiBaseUrl}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Last updated {new Date(connection.updatedAt).toLocaleString()}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CC API Base URL</label>
                  <Input
                    placeholder="https://api.comedyclash.lol"
                    value={ccApiBaseUrl}
                    onChange={(e) => setCcApiBaseUrl(e.target.value)}
                    className="text-sm h-8"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CC API Key</label>
                  <Input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={ccApiKey}
                    onChange={(e) => setCcApiKey(e.target.value)}
                    className="text-sm h-8"
                  />
                  <p className="text-xs text-muted-foreground">Stored encrypted at rest (AES-256-GCM).</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveConnectionMutation.mutate()}
                    disabled={!ccApiBaseUrl || !ccApiKey || saveConnectionMutation.isPending}
                  >
                    {saveConnectionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testConnectionMutation.mutate()}
                    disabled={!isConnected || testConnectionMutation.isPending}
                  >
                    {testConnectionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Test Connection
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Issue API keys so ComedyClash can call GalaxyBots APIs using the <code className="bg-secondary px-1 rounded">x-platform-key</code> header.
              Keys are scoped to <code className="bg-secondary px-1 rounded">/integrations/comedyclash/*</code>.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Key label (optional)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="text-sm h-8 flex-1"
              />
              <Button size="sm" onClick={() => issueKeyMutation.mutate(newKeyLabel)} disabled={issueKeyMutation.isPending}>
                {issueKeyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                Generate
              </Button>
            </div>
            {keys.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No keys yet.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{k.label || `Key #${k.id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(k.createdAt).toLocaleDateString()} · {k.requestCount} requests · limit {k.rateLimit}/hr
                      </p>
                    </div>
                    <Badge variant={k.status === "active" ? "default" : "secondary"} className="text-xs shrink-0">{k.status}</Badge>
                    {k.status === "active" && (
                      <>
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Rotate" onClick={() => rotateKeyMutation.mutate(k.id)}>
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" title="Revoke" onClick={() => revokeKeyMutation.mutate(k.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Register a ComedyClash endpoint to receive GalaxyBots events. All payloads are signed with
              <code className="bg-secondary px-1 rounded mx-1">X-GalaxyBots-Signature</code> HMAC-SHA256.
            </p>
            {webhookSub && (
              <div className="p-3 rounded-lg bg-secondary/40 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="truncate font-medium">{webhookSub.targetUrl}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={webhookSub.status === "active" ? "default" : "secondary"} className="text-xs">{webhookSub.status}</Badge>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => testPingMutation.mutate()} disabled={testPingMutation.isPending}>
                      {testPingMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Test Ping
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs"
                      onClick={() => toggleWebhookStatusMutation.mutate({
                        id: webhookSub.id,
                        status: webhookSub.status === "active" ? "paused" : "active",
                      })}>
                      {webhookSub.status === "active" ? "Pause" : "Resume"}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(webhookSub.events as string[]).map((e) => (
                    <Badge key={e} variant="outline" className="text-xs">{e}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target URL</label>
              <Input placeholder="https://comedyclash.lol/webhooks/galaxybots" value={whTargetUrl} onChange={(e) => setWhTargetUrl(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Signing Secret</label>
              <Input type="password" placeholder="At least 8 characters" value={whSecret} onChange={(e) => setWhSecret(e.target.value)} className="text-sm h-8" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Events</label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((e) => (
                  <label key={e} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whEvents.includes(e)}
                      onChange={(ev) =>
                        setWhEvents((prev) =>
                          ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e)
                        )
                      }
                    />
                    <code>{e}</code>
                  </label>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={() => saveWebhookMutation.mutate()} disabled={!whTargetUrl || !whSecret || whEvents.length === 0 || saveWebhookMutation.isPending}>
              {saveWebhookMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save Webhook
            </Button>

            {deliveryLog.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Log (last 20)</p>
                <div className="space-y-1">
                  {deliveryLog.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 text-xs">
                      <Badge variant="outline" className="text-xs shrink-0">{d.eventType}</Badge>
                      <Badge
                        variant={d.status === "delivered" ? "default" : d.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs shrink-0"
                      >{d.status}</Badge>
                      <span className="text-muted-foreground shrink-0">attempts: {d.attemptCount}</span>
                      {d.responseStatus && <span className="text-muted-foreground shrink-0">HTTP {d.responseStatus}</span>}
                      <span className="text-muted-foreground ml-auto">{new Date(d.createdAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="inbound" className="space-y-4">
            {!inboundSecretConfigured && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-medium">No inbound signing secret configured</p>
                  <p>Events sent by ComedyClash before a secret is generated will be stored as <span className="font-mono">unauthenticated</span> and will not trigger any pipelines. Generate a secret below and configure it in ComedyClash to start processing events.</p>
                </div>
              </div>
            )}
            <div className="p-3 rounded-lg bg-secondary/40 space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inbound Webhook URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 break-all">{inboundWebhookUrl}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => handleCopy(inboundWebhookUrl, "url")}>
                  {copied === "url" ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure ComedyClash to POST to this URL with an <code className="bg-secondary px-1 rounded">x-comedyclash-signature</code> HMAC-SHA256 header.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Inbound Signing Secret</p>
                <p className="text-xs text-muted-foreground">Regenerate to issue a new shared HMAC secret for ComedyClash to use.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => regenerateInboundSecretMutation.mutate()} disabled={regenerateInboundSecretMutation.isPending}>
                {regenerateInboundSecretMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Regenerate Secret
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Inbound Events</p>
              {inboundEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No inbound events received yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {inboundEvents.map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 text-xs">
                      <Badge variant="outline" className="text-xs shrink-0">{ev.eventType}</Badge>
                      <span className="text-muted-foreground flex-1">{ev.sessionId || "—"}</span>
                      {ev.status === "unauthenticated" ? (
                        <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-600 dark:text-amber-400 gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          unauthenticated
                        </Badge>
                      ) : (
                        <Badge variant={ev.status === "received" ? "default" : "secondary"} className="text-xs">{ev.status}</Badge>
                      )}
                      <span className="text-muted-foreground">{new Date(ev.createdAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
