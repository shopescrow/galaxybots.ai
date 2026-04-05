import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { CheckCircle2, Copy, ExternalLink, Link2, XCircle, Zap } from "lucide-react";
import { API_BASE } from "./types";

export function PirateMonsterPanel() {
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
