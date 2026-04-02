import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, Calendar, FileText, BarChart3, CheckCircle2, XCircle, Loader2, Zap, Copy, Link2, ExternalLink, Key, Shield, Activity, Webhook, RefreshCw, Trash2, Sparkles, ArrowRight, Table2, MessageSquare, Github, Twitter, Facebook, Instagram, Youtube, Music2, HelpCircle, ExternalLink as ExternalLinkIcon, Brain } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

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
    oauthSupported: true,
    credentialLabel: "Gmail OAuth Access Token",
    credentialPlaceholder: "Paste your OAuth access token here...",
    helpUrl: "https://developers.google.com/gmail/api/auth/about-auth",
    helpText: "Go to Google Cloud Console → APIs → Credentials → OAuth 2.0 Client IDs",
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    description: "Create and list calendar events using Google Calendar API.",
    icon: Calendar,
    oauthSupported: true,
    credentialLabel: "Google Calendar OAuth Access Token",
    credentialPlaceholder: "Paste your OAuth access token here...",
    helpUrl: "https://developers.google.com/calendar/api/guides/auth",
    helpText: "Go to Google Cloud Console → APIs → Credentials → OAuth 2.0 Client IDs",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    description: "Manage CRM contacts and deals using HubSpot private app token.",
    icon: BarChart3,
    oauthSupported: true,
    credentialLabel: "HubSpot Private App Access Token",
    credentialPlaceholder: "pat-na1-xxxx-xxxx-xxxx...",
    helpUrl: "https://developers.hubspot.com/docs/api/private-apps",
    helpText: "HubSpot → Settings → Integrations → Private Apps → Create a private app",
  },
  {
    key: "notion",
    name: "Notion",
    description: "Create and read documents/pages using Notion integration token.",
    icon: FileText,
    oauthSupported: true,
    credentialLabel: "Notion Integration Token",
    credentialPlaceholder: "ntn_xxxxxxxxxxxx...",
    helpUrl: "https://www.notion.so/my-integrations",
    helpText: "Notion → Settings → Integrations → Develop your own integrations → New integration",
  },
  {
    key: "slack",
    name: "Slack",
    description: "Post messages and notifications to Slack channels on behalf of your team.",
    icon: MessageSquare,
    oauthSupported: true,
    credentialLabel: "Slack Bot Token",
    credentialPlaceholder: "xoxb-xxxxxxxxxxxx...",
    helpUrl: "https://api.slack.com/apps",
    helpText: "Slack API → Your Apps → Create New App → OAuth & Permissions → Bot Token Scopes",
  },
  {
    key: "google_sheets",
    name: "Google Sheets",
    description: "Read and write rows in Google Sheets using the Sheets API.",
    icon: Table2,
    oauthSupported: false,
    credentialLabel: "Google Sheets Service Account JSON",
    credentialPlaceholder: '{"type":"service_account","project_id":"..."}',
    helpUrl: "https://developers.google.com/sheets/api/guides/authorizing",
    helpText: "Google Cloud Console → IAM → Service Accounts → Create → Download JSON key",
  },
  {
    key: "twilio",
    name: "Twilio SMS",
    description: "Send SMS messages via Twilio.",
    icon: MessageSquare,
    oauthSupported: false,
    credentialLabel: "Twilio Credentials (JSON)",
    credentialPlaceholder: '{"accountSid":"ACxxxxxxxxxx","authToken":"xxxxxxxx"}',
    helpUrl: "https://console.twilio.com/",
    helpText: "Twilio Console → Account → API Keys & Tokens. Copy Account SID and Auth Token.",
  },
  {
    key: "github",
    name: "GitHub",
    description: "Create issues and track engineering tasks in GitHub repositories.",
    icon: Github,
    oauthSupported: false,
    credentialLabel: "GitHub Personal Access Token",
    credentialPlaceholder: "ghp_xxxxxxxxxxxxxxxxxxxx...",
    helpUrl: "https://github.com/settings/tokens",
    helpText: "GitHub → Settings → Developer settings → Personal access tokens → Generate new token",
  },
  {
    key: "twitter",
    name: "Twitter / X",
    description: "Post tweets and social content using the Twitter API v2.",
    icon: Twitter,
    oauthSupported: false,
    credentialLabel: "Twitter Bearer Token",
    credentialPlaceholder: "AAAA...",
    helpUrl: "https://developer.twitter.com/en/portal/dashboard",
    helpText: "Twitter Developer Portal → Projects & Apps → Your App → Keys and tokens → Bearer Token",
  },
  {
    key: "facebook",
    name: "Facebook",
    description: "Post content and manage your Facebook Page using the Graph API.",
    icon: Facebook,
    oauthSupported: false,
    credentialLabel: "Facebook Page Access Token",
    credentialPlaceholder: "EAAxxxxxxxxxxxx...",
    helpUrl: "https://developers.facebook.com/tools/explorer/",
    helpText: "Facebook Graph API Explorer → select your app → Generate Access Token → grant pages_manage_posts and pages_read_engagement permissions",
  },
  {
    key: "instagram",
    name: "Instagram",
    description: "Publish posts and manage content on your Instagram Business account via the Graph API.",
    icon: Instagram,
    oauthSupported: false,
    credentialLabel: "Instagram Access Token",
    credentialPlaceholder: "EAAxxxxxxxxxxxx...",
    helpUrl: "https://developers.facebook.com/docs/instagram-api/getting-started",
    helpText: "Facebook Developer Console → Your App → Instagram Graph API → generate a long-lived token with instagram_basic and instagram_content_publish permissions",
  },
  {
    key: "youtube",
    name: "YouTube",
    description: "Upload videos, manage your channel, and schedule content using the YouTube Data API.",
    icon: Youtube,
    oauthSupported: false,
    credentialLabel: "YouTube OAuth Refresh Token (JSON)",
    credentialPlaceholder: '{"client_id":"...","client_secret":"...","refresh_token":"..."}',
    helpUrl: "https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps",
    helpText: "Google Cloud Console → APIs → YouTube Data API v3 → Credentials → OAuth 2.0 → Download JSON, then exchange for a refresh token",
  },
  {
    key: "tiktok",
    name: "TikTok",
    description: "Publish videos and manage content on your TikTok Business account using the TikTok API.",
    icon: Music2,
    oauthSupported: false,
    credentialLabel: "TikTok Access Token",
    credentialPlaceholder: "act.xxxxxxxxxxxx...",
    helpUrl: "https://developers.tiktok.com/doc/overview",
    helpText: "TikTok for Developers → Manage Apps → Your App → Keys & Access → generate an access token with video.publish and video.list scopes",
  },
];

function HelpTooltip({ text, url }: { text: string; url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        aria-label="Where do I find this?"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-5 z-20 w-64 rounded-lg border border-border/60 bg-background shadow-lg p-3 text-xs space-y-2">
            <p className="font-medium text-foreground">Where do I find this?</p>
            <p className="text-muted-foreground leading-relaxed">{text}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open documentation
              <ExternalLinkIcon className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}

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
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, token, updateOnboarding, refreshUser } = useAuth();
  const Icon = service.icon;

  const saveMutation = useMutation({
    mutationFn: async (cred: string) => {
      const res = await fetch(`${API_BASE}/client-integrations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      const res = await fetch(`${API_BASE}/client-integrations/${clientId}/${existing.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-integrations", clientId] });
      toast({ title: `${service.name} disconnected` });
    },
  });

  const handleOAuthConnect = useCallback(async () => {
    if (!user?.id || !clientId) return;
    setConnectingOAuth(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const initiateRes = await fetch(
        `${BASE}/api/oauth/initiate/${service.key}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!initiateRes.ok) {
        const err = await initiateRes.json().catch(() => ({}));
        if (!err.configured) {
          toast({ title: "OAuth not configured", description: `${service.name} OAuth is not set up. You can connect manually using the API key form below.`, variant: "destructive" });
        }
        setConnectingOAuth(false);
        return;
      }
      const { authUrl } = await initiateRes.json();
      if (!authUrl) { setConnectingOAuth(false); return; }

      const popup = window.open(authUrl, `oauth_${service.key}`, "width=600,height=700,scrollbars=yes,resizable=yes");

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.source !== popup) return;
        if (event.data?.type === "oauth_success" && event.data?.service === service.key) {
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(false);
          queryClient.invalidateQueries({ queryKey: ["client-integrations", clientId] });
          toast({ title: `${service.name} connected`, description: "OAuth connection successful." });
          if (user?.onboarding && !user.onboarding.integrations) {
            await updateOnboarding({ integrations: true }).catch(() => {});
          }
          await refreshUser();
          popup?.close();
        } else if (event.data?.type === "oauth_error" && event.data?.service === service.key) {
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(false);
          toast({ title: "Connection failed", description: event.data.error || "OAuth failed.", variant: "destructive" });
          popup?.close();
        }
      };

      window.addEventListener("message", handleMessage);
      const timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(false);
        }
      }, 1000);
    } catch (err) {
      console.error("[oauth] Failed:", err);
      setConnectingOAuth(false);
    }
  }, [user, token, clientId, service.key, queryClient, toast, updateOnboarding, refreshUser]);

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
            {service.oauthSupported && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                OAuth
              </Badge>
            )}
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
      <CardContent className="space-y-3">
        {isConnected && !editing ? (
          <div className="flex gap-2">
            <div className="flex-1 rounded bg-muted px-3 py-2 text-sm text-muted-foreground font-mono">
              {service.oauthSupported ? "OAuth connected ✓" : `••••••••${existing.credential.slice(-8)}`}
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
        ) : service.oauthSupported && !editing ? (
          <div className="space-y-2">
            <Button
              size="sm"
              variant="glow"
              onClick={handleOAuthConnect}
              disabled={connectingOAuth}
              className="gap-2"
            >
              {connectingOAuth ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
              ) : (
                `Connect with ${service.name}`
              )}
            </Button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Connect manually with API key instead
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground font-medium">{service.credentialLabel}</label>
              {service.helpText && service.helpUrl && (
                <HelpTooltip text={service.helpText} url={service.helpUrl} />
              )}
            </div>
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
              {(editing || service.oauthSupported) && (
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setCredential(""); }}>
                  Cancel
                </Button>
              )}
            </div>
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

function PirateMonsterOnboardingCard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: config } = useQuery<{ webhookUrl: string; inboundSecretConfigured: boolean; outboundKeyConfigured: boolean }>({
    queryKey: ["piratemonster-config-onboarding"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/piratemonster/config`);
      return res.json();
    },
  });

  const webhookUrl = config?.webhookUrl
    ? `${window.location.origin}${config.webhookUrl}`
    : `${window.location.origin}/api/integrations/piratemonster/webhook`;

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Webhook URL copied", description: "Paste this into PirateMonster.com under your account settings." });
  };

  const isConfigured = config?.inboundSecretConfigured && config?.outboundKeyConfigured;

  return (
    <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-purple-500/10">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-500/30 shrink-0">
          <Brain className="h-6 w-6 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg">PirateMonster AEO Intelligence</CardTitle>
            {isConfigured ? (
              <Badge variant="default" className="gap-1 bg-green-600 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> Active
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-purple-500/40 text-purple-400 shrink-0">
                Setup Required
              </Badge>
            )}
          </div>
          <CardDescription className="mt-1">
            Unlock AI visibility scores across 9 answer engines (ChatGPT, Gemini, Perplexity, and more). Connect PirateMonster to start receiving real-time AEO scan data for your clients.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-background/60 border border-purple-500/20 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Webhook className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Step 1 — Copy your Webhook URL</p>
              <p className="text-xs text-muted-foreground mb-2">
                Register this URL in your PirateMonster account so scan results are delivered directly to GalaxyBots.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-3 py-1.5 rounded bg-background border border-border/60 text-xs font-mono truncate">
                  {webhookUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5 border-purple-500/40 hover:bg-purple-500/10"
                  onClick={handleCopy}
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 border-t border-border/30 pt-3">
            <Key className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Step 2 — Configure API keys</p>
              <p className="text-xs text-muted-foreground">
                Set <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">PIRATEMONSTER_INBOUND_SECRET</code> and{" "}
                <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">PIRATEMONSTER_API_KEY</code> in your environment variables, then the full AEO panel below will show "Connected."
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Once connected, AEO scores appear on each client's profile automatically.
          </p>
          <a href="https://piratemonster.com" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0 border-purple-500/30 hover:bg-purple-500/10">
              <ExternalLink className="w-3.5 h-3.5" />
              Open PirateMonster
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
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

interface AuditEvent {
  id: number;
  action: string;
  createdAt: string;
}

interface ProspectorStats {
  dispatched: number;
  received: number;
  lastWebhook: string | null;
  avgConfidence: number;
}

function KiloProCard({ auditStats }: { auditStats: { lastEvent: AuditEvent | null, count: number } }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg">KiloPro Compliance</CardTitle>
              <CardDescription>Enterprise Grade Audit & Governance</CardDescription>
            </div>
          </div>
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div className="text-muted-foreground font-medium">Last Audit Event</div>
            <div className="truncate">
              {auditStats.lastEvent ? auditStats.lastEvent.action : "No events"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground font-medium">Event Count (24h)</div>
            <div className="">{auditStats.count}</div>
          </div>
        </div>
      </CardContent>
      <div className="border-t bg-muted/30 p-3 flex justify-between">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Activity className="w-3 h-3 text-primary" />
          Real-time monitoring enabled
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">Configure</Button>
      </div>
    </Card>
  );
}

function PirateMonsterProspectorCard({ pmStats }: { pmStats: ProspectorStats }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg">PirateMonster Prospector</CardTitle>
              <CardDescription>Autonomous B2B Lead Generation</CardDescription>
            </div>
          </div>
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-[10px] uppercase tracking-wider text-muted-foreground">
          <div className="space-y-1">
            <div>Dispatched</div>
            <div className="text-sm font-medium text-foreground">{pmStats.dispatched} Jobs</div>
          </div>
          <div className="space-y-1">
            <div>Received</div>
            <div className="text-sm font-medium text-foreground">{pmStats.received} Leads</div>
          </div>
          <div className="space-y-1">
            <div>Avg Confidence</div>
            <div className="text-sm font-medium text-foreground">{(pmStats.avgConfidence * 100).toFixed(0)}%</div>
          </div>
        </div>
        <div className="p-2 bg-muted/50 rounded text-[10px] flex items-center gap-2">
          <Webhook className="w-3 h-3 text-primary" />
          Last Webhook: {pmStats.lastWebhook ? format(new Date(pmStats.lastWebhook), "HH:mm:ss") : "Never"}
        </div>
      </CardContent>
      <div className="border-t bg-muted/30 p-3 flex justify-between">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          Webhook connection stable
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">View Logs</Button>
      </div>
    </Card>
  );
}

export default function Integrations() {
  const [clientId, setClientId] = useState<number>(1);
  const { toast } = useToast();
  const [auditStats, setAuditStats] = useState<{ lastEvent: AuditEvent | null, count: number }>({ lastEvent: null, count: 0 });
  const [pmStats, setPmStats] = useState<ProspectorStats>({ dispatched: 0, received: 0, lastWebhook: null, avgConfidence: 0 });
  const [highlightedService] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight");
  });

  useEffect(() => {
    if (highlightedService) {
      const el = document.getElementById(`integration-${highlightedService}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedService]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [auditRes, pmRes] = await Promise.all([
          fetch(`${API_BASE}/audit?limit=1`),
          fetch(`${API_BASE}/prospecting/stats`)
        ]);

        if (auditRes.ok) {
          const logs = await auditRes.json();
          setAuditStats({ lastEvent: logs[0] || null, count: logs.length });
        }

        if (pmRes.ok) {
          const stats = await pmRes.json();
          setPmStats({
            dispatched: stats.totalJobs || 0,
            received: stats.totalProspects || 0,
            lastWebhook: stats.patterns?.[0]?.updatedAt || null,
            avgConfidence: parseFloat(stats.avgConfidence || "0")
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchStats();
  }, []);

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
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
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
              className="rounded border px-3 py-1.5 text-sm bg-background text-foreground border-border min-w-[200px]"
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

        <PirateMonsterOnboardingCard />

        <PirateMonsterMcpPanel />

        <PirateMonsterPanel />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KiloProCard auditStats={auditStats} />
          <PirateMonsterProspectorCard pmStats={pmStats} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4">
            {SERVICES.map((service) => (
              <div
                key={service.key}
                id={`integration-${service.key}`}
                className={highlightedService === service.key ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl transition-all" : ""}
              >
                <IntegrationCard
                  service={service}
                  existing={integrationMap.get(service.key)}
                  clientId={clientId}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
