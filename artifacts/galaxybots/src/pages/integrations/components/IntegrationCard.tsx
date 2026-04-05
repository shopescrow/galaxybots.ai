import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";
import { SERVICES } from "./constants";
import { API_BASE, type Integration } from "./types";

export function IntegrationCard({
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
