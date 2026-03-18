import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Loader2, Mail, Zap, Send, Clock, ChevronDown, ChevronUp, FileText } from "lucide-react";

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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BriefingSettings {
  id: number;
  clientId: number;
  emailEnabled: number;
  emailRecipients: string[] | null;
  slackEnabled: number;
  slackChannel: string | null;
  deliveryHour: number;
  deliveryMinute: number;
  timezone: string;
  lastMorningBriefAt: string | null;
  lastWeeklyBriefAt: string | null;
}

interface Brief {
  id: number;
  briefType: "morning" | "weekly";
  generatedAt: string;
  bodyText: string;
  bodyHtml: string;
  deliveredAt: { email?: string; slack?: string } | null;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i === 0 ? "12" : i > 12 ? i - 12 : i}:XX ${i < 12 ? "AM" : "PM"}`,
}));

const MINUTES = [0, 15, 30, 45].map(m => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));

export function IntelligenceBriefingsTab({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<BriefingSettings>({
    queryKey: ["briefing-settings", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/briefs/settings/${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load briefing settings");
      return res.json();
    },
  });

  const { data: recentBriefs } = useQuery<Brief[]>({
    queryKey: ["briefs", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/briefs?clientId=${clientId}&limit=5`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load briefs");
      return res.json();
    },
    enabled: !!clientId,
  });

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [slackChannel, setSlackChannel] = useState("galaxybots-brief");
  const [deliveryHour, setDeliveryHour] = useState(7);
  const [deliveryMinute, setDeliveryMinute] = useState(30);
  const [timezone, setTimezone] = useState("America/Toronto");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(false);

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
    mutationFn: async (data: Partial<{
      emailEnabled: boolean;
      emailRecipients: string[];
      slackEnabled: boolean;
      slackChannel: string;
      deliveryHour: number;
      deliveryMinute: number;
      timezone: string;
    }>) => {
      const res = await fetch(`${BASE}/api/briefs/settings/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["briefing-settings", clientId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (briefType: "morning" | "weekly") => {
      const res = await fetch(`${BASE}/api/briefs/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clientId, briefType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Generation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["briefs", clientId] });
      queryClient.invalidateQueries({ queryKey: ["briefing-settings", clientId] });
    },
  });

  const handleSave = () => {
    const recipients = emailRecipients
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    updateMutation.mutate({
      emailEnabled,
      emailRecipients: recipients,
      slackEnabled,
      slackChannel,
      deliveryHour,
      deliveryMinute,
      timezone,
    });
  };

  const latestBrief = recentBriefs?.[0];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/30">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-display">Intelligence Briefings</CardTitle>
            <p className="text-xs text-muted-foreground font-tech mt-0.5">
              Daily morning briefs and weekly digests from your bot team
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 p-4 rounded-lg border border-border/40 bg-card/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Email Delivery</span>
                </div>
                <Switch
                  checked={emailEnabled}
                  onCheckedChange={setEmailEnabled}
                />
              </div>
              {emailEnabled && (
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">CC Email Addresses</label>
                  <Input
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    placeholder="email@example.com, another@example.com"
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated. Owner email is always included.</p>
                </div>
              )}
            </div>

            <div className="space-y-4 p-4 rounded-lg border border-border/40 bg-card/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                  </svg>
                  <span className="text-sm font-medium">Slack Delivery</span>
                </div>
                <Switch
                  checked={slackEnabled}
                  onCheckedChange={setSlackEnabled}
                />
              </div>
              {slackEnabled && (
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Slack Channel</label>
                  <Input
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    placeholder="galaxybots-brief"
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Channel name without #. Requires Slack Bot Token configured.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-tech uppercase text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Delivery Hour
              </label>
              <select
                value={deliveryHour}
                onChange={(e) => setDeliveryHour(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {HOURS.map(h => (
                  <option key={h.value} value={h.value}>{h.label.replace(":XX", "")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-tech uppercase text-muted-foreground">Minute</label>
              <select
                value={deliveryMinute}
                onChange={(e) => setDeliveryMinute(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {MINUTES.map(m => (
                  <option key={m.value} value={m.value}>:{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-tech uppercase text-muted-foreground">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              variant="glow"
              className="font-tech"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {updateMutation.isSuccess ? "Saved!" : "Save Settings"}
            </Button>

            <Button
              onClick={() => generateMutation.mutate("morning")}
              disabled={generateMutation.isPending}
              variant="outline"
              className="font-tech text-sm"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Brief Now
            </Button>

            <Button
              onClick={() => generateMutation.mutate("weekly")}
              disabled={generateMutation.isPending}
              variant="outline"
              size="sm"
              className="font-tech text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            >
              Send Weekly Digest
            </Button>

            {generateMutation.isSuccess && (
              <span className="text-xs text-green-400 font-tech">Brief generated & delivered!</span>
            )}
            {generateMutation.isError && (
              <span className="text-xs text-destructive font-tech">{generateMutation.error?.message}</span>
            )}
          </div>

          {updateMutation.isError && (
            <p className="text-destructive text-xs">Failed to save settings. Please try again.</p>
          )}
        </CardContent>
      </Card>

      {settings?.lastMorningBriefAt || settings?.lastWeeklyBriefAt ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {settings.lastMorningBriefAt && (
            <div className="rounded-lg border border-border/40 bg-card/30 p-3">
              <span className="text-xs font-tech uppercase text-muted-foreground">Last Morning Brief</span>
              <p className="font-medium mt-1">
                {new Date(settings.lastMorningBriefAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          )}
          {settings.lastWeeklyBriefAt && (
            <div className="rounded-lg border border-border/40 bg-card/30 p-3">
              <span className="text-xs font-tech uppercase text-muted-foreground">Last Weekly Digest</span>
              <p className="font-medium mt-1">
                {new Date(settings.lastWeeklyBriefAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {latestBrief && (
        <Card>
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setPreviewExpanded(!previewExpanded)}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Preview Last Brief</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {latestBrief.briefType === "weekly" ? "Weekly" : "Morning"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(latestBrief.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {previewExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
          {previewExpanded && (
            <div className="border-t border-border/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant={previewHtml ? "ghost" : "outline"}
                  size="sm"
                  className="text-xs font-tech"
                  onClick={() => setPreviewHtml(false)}
                >
                  Plain Text
                </Button>
                <Button
                  variant={previewHtml ? "outline" : "ghost"}
                  size="sm"
                  className="text-xs font-tech"
                  onClick={() => setPreviewHtml(true)}
                >
                  HTML Preview
                </Button>
              </div>
              {previewHtml ? (
                <SandboxedHtml html={latestBrief.bodyHtml} />
              ) : (
                <pre className="text-sm text-foreground/90 whitespace-pre-wrap font-mono bg-card/50 rounded-lg p-4 border border-border/40 leading-relaxed">
                  {latestBrief.bodyText}
                </pre>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
