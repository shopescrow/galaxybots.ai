import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, Calendar, FileText, BarChart3, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
    credentialPlaceholder: "ya29.a0AfH6SM...",
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    description: "Create and list calendar events using Google Calendar API.",
    icon: Calendar,
    credentialLabel: "Google Calendar OAuth Access Token",
    credentialPlaceholder: "ya29.a0AfH6SM...",
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
      return res.json();
    },
    enabled: !!clientId,
  });

  const integrationMap = new Map(integrations.map((i) => [i.service, i]));

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
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
