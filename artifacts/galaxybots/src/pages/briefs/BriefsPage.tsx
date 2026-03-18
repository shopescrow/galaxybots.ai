import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Loader2, Mail, Hash, Zap, ChevronDown, ChevronUp, Calendar, FileText, RefreshCw, Settings, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Brief {
  id: number;
  clientId: number;
  briefType: "morning" | "weekly";
  generatedAt: string;
  deliveryChannels: { email: boolean; slack: boolean };
  deliveredAt: { email?: string; slack?: string } | null;
  bodyHtml: string;
  bodyText: string;
}

interface GlobalSettings {
  id: number;
  clientId: null;
  emailEnabled: number;
  emailRecipients: string[] | null;
  slackEnabled: number;
  slackChannel: string | null;
  deliveryHour: number;
  deliveryMinute: number;
  timezone: string;
}

function SandboxedHtml({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const adjustHeight = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + "px";
      }
    };
    iframe.onload = adjustHeight;
    setTimeout(adjustHeight, 100);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Brief HTML Preview"
      sandbox=""
      className="w-full rounded-lg border border-border/40 min-h-[400px]"
      style={{ background: "#0f0f1a" }}
    />
  );
}

function BriefRow({ brief, isFirst }: { brief: Brief; isFirst: boolean }) {
  const [expanded, setExpanded] = useState(isFirst);
  const [showHtml, setShowHtml] = useState(false);

  const date = new Date(brief.generatedAt);
  const dateLabel = date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <Card className="border-border/40 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${brief.briefType === "weekly" ? "bg-amber-500/10 border border-amber-500/30" : "bg-primary/10 border border-primary/30"}`}>
            {brief.briefType === "weekly" ? (
              <Calendar className="w-4 h-4 text-amber-400" />
            ) : (
              <Zap className="w-4 h-4 text-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{dateLabel}</span>
              <Badge variant={brief.briefType === "weekly" ? "outline" : "default"} className={`text-[10px] uppercase ${brief.briefType === "weekly" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" : ""}`}>
                {brief.briefType === "morning" ? "Morning Brief" : "Weekly Digest"}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">{timeLabel}</span>
              {brief.deliveredAt?.email && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Mail className="w-3 h-3" /> Email sent
                </span>
              )}
              {brief.deliveredAt?.slack && (
                <span className="flex items-center gap-1 text-xs text-purple-400">
                  <Hash className="w-3 h-3" /> Slack sent
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant={showHtml ? "ghost" : "outline"}
                size="sm"
                className="text-xs font-tech"
                onClick={() => setShowHtml(false)}
              >
                <FileText className="w-3 h-3 mr-1" /> Plain Text
              </Button>
              <Button
                variant={showHtml ? "outline" : "ghost"}
                size="sm"
                className="text-xs font-tech"
                onClick={() => setShowHtml(true)}
              >
                HTML Preview
              </Button>
            </div>

            {showHtml ? (
              <SandboxedHtml html={brief.bodyHtml} />
            ) : (
              <pre className="text-sm text-foreground/90 whitespace-pre-wrap font-mono bg-card/50 rounded-lg p-4 border border-border/40 leading-relaxed">
                {brief.bodyText}
              </pre>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Vancouver", "America/Phoenix", "Europe/London",
  "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore",
  "Australia/Sydney", "Pacific/Auckland",
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i === 0 ? "12" : i > 12 ? i - 12 : i} ${i < 12 ? "AM" : "PM"}`,
}));

const MINUTES = [0, 15, 30, 45].map(m => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));

function GlobalSettingsPanel() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<GlobalSettings>({
    queryKey: ["briefs-global-settings"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/briefs/settings/global`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load global settings");
      return res.json();
    },
  });

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [slackChannel, setSlackChannel] = useState("galaxybots-brief");
  const [deliveryHour, setDeliveryHour] = useState(7);
  const [deliveryMinute, setDeliveryMinute] = useState(30);
  const [timezone, setTimezone] = useState("America/Toronto");

  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.emailEnabled === 1);
      setSlackEnabled(settings.slackEnabled === 1);
      setEmailRecipients(settings.emailRecipients?.join(", ") ?? "");
      setSlackChannel(settings.slackChannel ?? "galaxybots-brief");
      setDeliveryHour(settings.deliveryHour ?? 7);
      setDeliveryMinute(settings.deliveryMinute ?? 30);
      setTimezone(settings.timezone ?? "America/Toronto");
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await fetch(`${BASE}/api/briefs/settings/global`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update global settings");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["briefs-global-settings"] }),
  });

  const handleSave = () => {
    const recipients = emailRecipients.split(",").map(s => s.trim()).filter(Boolean);
    updateMutation.mutate({ emailEnabled, emailRecipients: recipients, slackEnabled, slackChannel, deliveryHour, deliveryMinute, timezone });
  };

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card className="border-border/40 mb-8">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <CardTitle className="text-lg font-display">Global Default Settings</CardTitle>
          <p className="text-xs text-muted-foreground font-tech mt-0.5">
            Default briefing schedule applied to all clients without their own settings
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4 p-4 rounded-lg border border-border/40 bg-card/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Email Delivery (Default)</span>
              </div>
              <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
            </div>
            {emailEnabled && (
              <div className="space-y-2">
                <label className="text-xs font-tech uppercase text-muted-foreground">Default Recipients</label>
                <Input
                  value={emailRecipients}
                  onChange={e => setEmailRecipients(e.target.value)}
                  placeholder="admin@company.com, ops@company.com"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">Comma-separated. Added to every client brief unless overridden.</p>
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 rounded-lg border border-border/40 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Slack Delivery (Default)</span>
              <Switch checked={slackEnabled} onCheckedChange={setSlackEnabled} />
            </div>
            {slackEnabled && (
              <div className="space-y-2">
                <label className="text-xs font-tech uppercase text-muted-foreground">Default Slack Channel</label>
                <Input
                  value={slackChannel}
                  onChange={e => setSlackChannel(e.target.value)}
                  placeholder="galaxybots-brief"
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-tech uppercase text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Default Hour
            </label>
            <select
              value={deliveryHour}
              onChange={e => setDeliveryHour(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-tech uppercase text-muted-foreground">Minute</label>
            <select
              value={deliveryMinute}
              onChange={e => setDeliveryMinute(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {MINUTES.map(m => <option key={m.value} value={m.value}>:{m.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-tech uppercase text-muted-foreground">Default Timezone</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={updateMutation.isPending} variant="glow" className="font-tech">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {updateMutation.isSuccess ? "Saved!" : "Save Global Defaults"}
          </Button>
          {updateMutation.isError && (
            <span className="text-xs text-destructive font-tech">{updateMutation.error?.message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BriefsPage() {
  const { user } = useAuth();
  const clientId = user?.clientId;
  const isPlatformAdmin = (user as { bypassPayment?: boolean } | null)?.bypassPayment === true;

  const { data: briefs, isLoading, refetch, isFetching } = useQuery<Brief[]>({
    queryKey: ["briefs", clientId],
    queryFn: async () => {
      const params = clientId ? `?clientId=${clientId}&limit=30` : `?limit=30`;
      const res = await fetch(`${BASE}/api/briefs${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load briefs");
      return res.json();
    },
    enabled: !!clientId,
  });

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
              <Zap className="text-primary w-7 h-7" />
              Intelligence Briefings
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Daily and weekly intelligence briefs from your bot team — last 30 days
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="font-tech text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Refresh
            </Button>
            <Link href="/settings">
              <Button variant="glow" size="sm" className="font-tech text-xs">
                Briefing Settings →
              </Button>
            </Link>
          </div>
        </div>

        {isPlatformAdmin && <GlobalSettingsPanel />}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !briefs || briefs.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-display font-bold mb-2">No Briefings Yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Enable Intelligence Briefings in your settings to start receiving daily morning briefs and weekly digests from your bot team.
              </p>
              <Link href="/settings">
                <Button variant="glow" className="font-tech">Configure Briefings →</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {briefs.map((brief, i) => (
              <BriefRow key={brief.id} brief={brief} isFirst={i === 0} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
