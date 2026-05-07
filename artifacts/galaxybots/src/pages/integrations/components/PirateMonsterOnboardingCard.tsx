import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Brain, CheckCircle2, Copy, ExternalLink, Key, Webhook } from "lucide-react";
import { API_BASE } from "./types";

export function PirateMonsterOnboardingCard() {
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
