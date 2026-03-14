import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, PhoneCall, PhoneOutgoing, Settings, Database, List, Loader2,
  CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp, Zap, Brain
} from "lucide-react";
import { format } from "date-fns";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

// TODO: Replace with authenticated tenant context from auth system.
// Currently using demo client for the single-tenant demo environment.
const DEFAULT_CLIENT_ID = 1; // Platform-wide default: no auth system exists yet — all pages use client ID 1. Replace with auth context when auth is added.

interface ReceptionistConfig {
  id: number;
  clientId: number;
  elevenlabsAgentId: string | null;
  twilioPhoneNumber: string | null;
  businessName: string | null;
  businessHoursJson: Record<string, unknown> | null;
  knowledgeBasePrompt: string | null;
  notificationEmail: string | null;
  crmType: string;
  crmWebhookUrl: string | null;
  crmFieldMapJson: Record<string, unknown> | null;
  isActive: boolean;
  improvementCallCount: number;
  lastImprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CallLog {
  id: number;
  configId: number;
  twilioCallSid: string | null;
  twilioRecordingUrl: string | null;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  status: string;
  durationSeconds: number | null;
  transcriptText: string | null;
  transcriptSummary: string | null;
  crmSynced: boolean;
  crmSyncError: string | null;
  emailSent: boolean;
  createdAt: string;
}

interface ImprovementRun {
  id: number;
  configId: number;
  callsAnalyzed: number;
  oldPromptSnapshot: string | null;
  newPrompt: string | null;
  improvementNotes: string | null;
  createdAt: string;
}

function useReceptionistConfig() {
  return useQuery<ReceptionistConfig | null>({
    queryKey: ["receptionist-config"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/receptionist/config/${DEFAULT_CLIENT_ID}`);
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
  });
}

function useCallLogs(filters: Record<string, string>) {
  return useQuery({
    queryKey: ["call-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters);
      const res = await fetch(`${API_BASE}/receptionist/call-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch call logs");
      return res.json() as Promise<{
        data: CallLog[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>;
    },
  });
}

function useImprovementHistory(configId: number | undefined) {
  return useQuery<ImprovementRun[]>({
    queryKey: ["improvement-history", configId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/receptionist/improvement-history/${configId}`);
      if (!res.ok) throw new Error("Failed to fetch improvement history");
      return res.json();
    },
    enabled: !!configId,
  });
}

export default function AIReceptionist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading: configLoading } = useReceptionistConfig();

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan/20 flex items-center justify-center border border-primary/30">
            <Phone className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">AI Receptionist</h1>
            <p className="text-muted-foreground">Vera — Voice & Communications</p>
          </div>
          {config && (
            <Badge variant={config.isActive ? "cyan" : "secondary"} className="ml-auto">
              {config.isActive ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>

        {configLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="setup" className="space-y-6">
            <TabsList className="bg-secondary/50 border border-border/40">
              <TabsTrigger value="setup" className="gap-2">
                <Settings className="w-4 h-4" /> Setup
              </TabsTrigger>
              <TabsTrigger value="crm" className="gap-2">
                <Database className="w-4 h-4" /> CRM Integration
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-2">
                <List className="w-4 h-4" /> Call Logs
              </TabsTrigger>
              <TabsTrigger value="call" className="gap-2">
                <PhoneOutgoing className="w-4 h-4" /> Make a Call
              </TabsTrigger>
            </TabsList>

            <TabsContent value="setup">
              <SetupTab config={config} />
            </TabsContent>
            <TabsContent value="crm">
              <CRMTab config={config} />
            </TabsContent>
            <TabsContent value="logs">
              <CallLogsTab config={config} />
            </TabsContent>
            <TabsContent value="call">
              <MakeCallTab config={config} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}

function SetupTab({ config }: { config: ReceptionistConfig | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [businessName, setBusinessName] = useState(config?.businessName || "");
  const [businessHours, setBusinessHours] = useState(
    config?.businessHoursJson ? JSON.stringify(config.businessHoursJson, null, 2) : '{\n  "monday": "9:00 AM - 5:00 PM",\n  "tuesday": "9:00 AM - 5:00 PM",\n  "wednesday": "9:00 AM - 5:00 PM",\n  "thursday": "9:00 AM - 5:00 PM",\n  "friday": "9:00 AM - 5:00 PM",\n  "saturday": "Closed",\n  "sunday": "Closed"\n}'
  );
  const [knowledgeBase, setKnowledgeBase] = useState(config?.knowledgeBasePrompt || "");
  const [agentId, setAgentId] = useState(config?.elevenlabsAgentId || "");
  const [twilioNumber, setTwilioNumber] = useState(config?.twilioPhoneNumber || "");
  const [email, setEmail] = useState(config?.notificationEmail || "");

  const { data: improvementHistory } = useImprovementHistory(config?.id);
  const [showHistory, setShowHistory] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let hoursJson;
      try {
        hoursJson = JSON.parse(businessHours);
      } catch {
        toast({ title: "Invalid JSON", description: "Business hours must be valid JSON", variant: "destructive" });
        setSaving(false);
        return;
      }

      const body = {
        clientId: DEFAULT_CLIENT_ID,
        elevenlabsAgentId: agentId,
        twilioPhoneNumber: twilioNumber,
        businessName,
        businessHoursJson: hoursJson,
        knowledgeBasePrompt: knowledgeBase,
        notificationEmail: email,
      };

      const method = config ? "PUT" : "POST";
      const url = config
        ? `${API_BASE}/receptionist/config/${DEFAULT_CLIENT_ID}`
        : `${API_BASE}/receptionist/config`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["receptionist-config"] });
      toast({ title: "Saved", description: "Receptionist configuration updated." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save configuration", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API_BASE}/receptionist/config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elevenlabsAgentId: agentId }),
      });
      const data = await res.json();
      if (data.elevenlabs?.success) {
        toast({ title: "Connection Successful", description: `Agent found: ${data.elevenlabs.agentName}` });
      } else {
        toast({ title: "Connection Failed", description: data.elevenlabs?.error || "Unable to reach agent", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Connection test failed", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Business Name</label>
            <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your Business Name" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Business Hours (JSON)</label>
            <Textarea value={businessHours} onChange={e => setBusinessHours(e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-muted-foreground font-tech uppercase tracking-wider">Knowledge Base Prompt</label>
              {config?.lastImprovedAt && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Brain className="w-3 h-3" />
                  Last auto-improved: {format(new Date(config.lastImprovedAt), "MMM d, yyyy HH:mm")}
                </Badge>
              )}
            </div>
            <Textarea
              value={knowledgeBase}
              onChange={e => setKnowledgeBase(e.target.value)}
              rows={10}
              placeholder="Describe your business, common questions, services, pricing, etc. This will be used to train the AI receptionist."
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Notification Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="alerts@yourbusiness.com" type="email" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Voice & Phone Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">ElevenLabs Agent ID</label>
            <div className="flex gap-2">
              <Input value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="agent_xxxxxxxxxx" className="font-mono" />
              <Button variant="outline" onClick={handleTest} disabled={testing || !agentId}>
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span className="ml-2">Test</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Create your agent at elevenlabs.io and paste the Agent ID here.</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Twilio Phone Number</label>
            <Input value={twilioNumber} onChange={e => setTwilioNumber(e.target.value)} placeholder="+15551234567" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="glow" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Configuration
        </Button>
      </div>

      {improvementHistory && improvementHistory.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                Self-Improvement History
              </CardTitle>
              {showHistory ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </CardHeader>
          {showHistory && (
            <CardContent className="space-y-4">
              {improvementHistory.map(run => (
                <div key={run.id} className="border border-border/40 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{run.callsAnalyzed} calls analyzed</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(run.createdAt), "MMM d, yyyy HH:mm")}</span>
                  </div>
                  {run.improvementNotes && (
                    <p className="text-sm text-muted-foreground">{run.improvementNotes}</p>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

function CRMTab({ config }: { config: ReceptionistConfig | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);

  const [crmType, setCrmType] = useState(config?.crmType || "none");
  const [webhookUrl, setWebhookUrl] = useState(config?.crmWebhookUrl || "");
  const [fieldMap, setFieldMap] = useState(
    config?.crmFieldMapJson ? JSON.stringify(config.crmFieldMapJson, null, 2) : '{}'
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      let fieldMapJson;
      try {
        fieldMapJson = JSON.parse(fieldMap);
      } catch {
        toast({ title: "Invalid JSON", description: "Field map must be valid JSON", variant: "destructive" });
        setSaving(false);
        return;
      }

      const method = config ? "PUT" : "POST";
      const url = config
        ? `${API_BASE}/receptionist/config/${DEFAULT_CLIENT_ID}`
        : `${API_BASE}/receptionist/config`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: DEFAULT_CLIENT_ID,
          crmType,
          crmWebhookUrl: webhookUrl,
          crmFieldMapJson: fieldMapJson,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["receptionist-config"] });
      toast({ title: "Saved", description: "CRM settings updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save CRM settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      const res = await fetch(`${API_BASE}/receptionist/config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmType: "custom_webhook", crmWebhookUrl: webhookUrl }),
      });
      const data = await res.json();
      if (data.webhook?.success) {
        toast({ title: "Webhook Test Passed", description: "Test payload delivered successfully." });
      } else {
        toast({ title: "Webhook Test Failed", description: data.webhook?.error || "Unable to reach webhook", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Webhook test failed", variant: "destructive" });
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">CRM Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block font-tech uppercase tracking-wider">CRM Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: "none", label: "None" },
              { value: "hubspot", label: "HubSpot" },
              { value: "salesforce", label: "Salesforce" },
              { value: "custom_webhook", label: "Custom Webhook" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setCrmType(opt.value)}
                className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                  crmType === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/40 hover:border-primary/30"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {crmType === "hubspot" && (
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/40">
            <p className="text-sm text-muted-foreground mb-2">
              HubSpot uses the credential stored in your Integrations settings. Make sure you have a HubSpot integration connected for this client.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="/integrations">Go to Integrations →</a>
            </Button>
          </div>
        )}

        {crmType === "salesforce" && (
          <SalesforceCredentialsSection />
        )}

        {crmType === "custom_webhook" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Webhook URL</label>
              <div className="flex gap-2">
                <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-app.replit.app/api/calls" className="font-mono" />
                <Button variant="outline" onClick={handleTestWebhook} disabled={testingWebhook || !webhookUrl}>
                  {testingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  <span className="ml-2">Test</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Payloads are signed with HMAC-SHA256 via the X-GalaxyBots-Signature header.
              </p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Field Mapping (JSON)</label>
              <Textarea value={fieldMap} onChange={e => setFieldMap(e.target.value)} rows={6} className="font-mono text-sm" />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="glow" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save CRM Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SalesforceCredentialsSection() {
  const [sfClientId, setSfClientId] = useState("");
  const [sfClientSecret, setSfClientSecret] = useState("");
  const [sfLoginUrl, setSfLoginUrl] = useState("login.salesforce.com");
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleSaveSfCreds = async () => {
    setSaving(true);
    try {
      const credentialPayload = JSON.stringify({
        client_id: sfClientId,
        client_secret: sfClientSecret,
        login_url: `https://${sfLoginUrl}`,
      });
      const res = await fetch(`${API_BASE}/client-integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: DEFAULT_CLIENT_ID,
          service: "salesforce",
          credential: credentialPayload,
          label: "Salesforce OAuth",
        }),
      });
      if (!res.ok) throw new Error("Failed to save credentials");
      toast({ title: "Salesforce Credentials Saved", description: "Credentials stored securely in the credential store." });
    } catch {
      toast({ title: "Error", description: "Could not save Salesforce credentials", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-secondary/30 border border-border/40 space-y-4">
      <p className="text-sm text-muted-foreground">
        Salesforce requires OAuth client credentials to log calls as Tasks. Credentials are encrypted and stored securely.
      </p>
      <div>
        <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Client ID</label>
        <Input value={sfClientId} onChange={e => setSfClientId(e.target.value)} placeholder="Your Salesforce connected app client ID" className="font-mono" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Client Secret</label>
        <Input type="password" value={sfClientSecret} onChange={e => setSfClientSecret(e.target.value)} placeholder="Your Salesforce connected app client secret" className="font-mono" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Login URL</label>
        <Input value={sfLoginUrl} onChange={e => setSfLoginUrl(e.target.value)} placeholder="login.salesforce.com" className="font-mono" />
        <p className="text-xs text-muted-foreground mt-1">Use test.salesforce.com for sandbox environments.</p>
      </div>
      <Button variant="outline" onClick={handleSaveSfCreds} disabled={saving || !sfClientId || !sfClientSecret}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save Salesforce Credentials
      </Button>
    </div>
  );
}

function CallLogsTab({ config }: { config: ReceptionistConfig | null | undefined }) {
  const [page, setPage] = useState(1);
  const [directionFilter, setDirectionFilter] = useState("");
  const [crmFilter, setCrmFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const filters: Record<string, string> = { page: String(page), limit: "15" };
  if (config?.id) {
    filters.configId = String(config.id);
  } else {
    filters.clientId = String(DEFAULT_CLIENT_ID);
  }
  if (directionFilter) filters.direction = directionFilter;
  if (crmFilter) filters.crmSynced = crmFilter;
  if (startDate) filters.startDate = new Date(startDate).toISOString();
  if (endDate) filters.endDate = new Date(endDate + "T23:59:59").toISOString();

  const { data, isLoading } = useCallLogs(filters);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-lg">Call Logs</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <select
              value={directionFilter}
              onChange={e => { setDirectionFilter(e.target.value); setPage(1); }}
              className="bg-secondary border border-border/40 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select
              value={crmFilter}
              onChange={e => { setCrmFilter(e.target.value); setPage(1); }}
              className="bg-secondary border border-border/40 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All CRM Status</option>
              <option value="true">CRM Synced</option>
              <option value="false">Not Synced</option>
            </select>
            <Input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(1); }}
              className="w-36 bg-secondary border-border/40 text-sm"
              placeholder="Start date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="w-36 bg-secondary border-border/40 text-sm"
              placeholder="End date"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-32 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !data?.data?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <PhoneCall className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No call logs yet</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground font-tech uppercase tracking-wider text-xs">
                    <th className="text-left py-3 px-2">Timestamp</th>
                    <th className="text-left py-3 px-2">Direction</th>
                    <th className="text-left py-3 px-2">Caller</th>
                    <th className="text-left py-3 px-2">Duration</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-center py-3 px-2">CRM</th>
                    <th className="text-center py-3 px-2">Email</th>
                    <th className="py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map(log => (
                    <>
                      <tr key={log.id} className="border-b border-border/20 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 px-2 text-xs">{format(new Date(log.createdAt), "MMM d, HH:mm")}</td>
                        <td className="py-3 px-2">
                          <Badge variant={log.direction === "inbound" ? "cyan" : "outline"} className="text-xs">
                            {log.direction === "inbound" ? "↙ In" : "↗ Out"}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 font-mono text-xs">{log.fromNumber || "Unknown"}</td>
                        <td className="py-3 px-2 text-xs">
                          {log.durationSeconds ? `${Math.floor(log.durationSeconds / 60)}:${String(log.durationSeconds % 60).padStart(2, "0")}` : "—"}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant={log.status === "completed" ? "glow" : "secondary"} className="text-xs">
                            {log.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {log.crmSynced ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {log.emailSent ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <button
                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                            className="text-muted-foreground hover:text-primary"
                          >
                            {expandedRow === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === log.id && (
                        <tr key={`${log.id}-detail`}>
                          <td colSpan={8} className="py-4 px-4 bg-secondary/20">
                            <div className="space-y-3">
                              {log.transcriptSummary && (
                                <div>
                                  <p className="text-xs text-muted-foreground font-tech uppercase mb-1">Summary</p>
                                  <p className="text-sm">{log.transcriptSummary}</p>
                                </div>
                              )}
                              {log.transcriptText && (
                                <div>
                                  <p className="text-xs text-muted-foreground font-tech uppercase mb-1">Transcript</p>
                                  <pre className="text-xs whitespace-pre-wrap bg-background/50 p-3 rounded-lg border border-border/30 max-h-48 overflow-y-auto">
                                    {log.transcriptText}
                                  </pre>
                                </div>
                              )}
                              {log.twilioRecordingUrl && (
                                <a
                                  href={log.twilioRecordingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" /> Listen to Recording
                                </a>
                              )}
                              {log.crmSyncError && (
                                <p className="text-xs text-red-400">CRM Error: {log.crmSyncError}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground flex items-center px-3">
                  Page {data.pagination.page} of {data.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MakeCallTab({ config }: { config: ReceptionistConfig | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [calling, setCalling] = useState(false);

  const handleCall = async () => {
    if (!phoneNumber) {
      toast({ title: "Error", description: "Please enter a phone number", variant: "destructive" });
      return;
    }

    setCalling(true);
    try {
      const res = await fetch(`${API_BASE}/receptionist/outbound-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          configId: config?.id,
          clientId: DEFAULT_CLIENT_ID,
          contextNotes: contextNotes || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to initiate call");
      }

      toast({ title: "Call Initiated", description: `Calling ${phoneNumber}...` });
      setPhoneNumber("");
      setContextNotes("");
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
    } catch (err) {
      toast({ title: "Call Failed", description: err instanceof Error ? err.message : "Unable to make call", variant: "destructive" });
    } finally {
      setCalling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Make an Outbound Call</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div>
          <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Phone Number</label>
          <Input
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            placeholder="+15551234567"
            className="font-mono"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block font-tech uppercase tracking-wider">Context Notes (Optional)</label>
          <Textarea
            value={contextNotes}
            onChange={e => setContextNotes(e.target.value)}
            placeholder="Any context for the AI to know before calling..."
            rows={4}
          />
        </div>
        <Button variant="glow" onClick={handleCall} disabled={calling || !phoneNumber} className="gap-2">
          {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOutgoing className="w-4 h-4" />}
          Call Now
        </Button>
      </CardContent>
    </Card>
  );
}
