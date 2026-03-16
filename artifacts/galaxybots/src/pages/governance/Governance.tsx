import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield, Lock, Unlock, AlertTriangle, CheckCircle, XCircle,
  Loader2, Save, Plus, Trash2, Copy, Bot, Megaphone
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ToolInfo = { name: string; description: string; isSensitive: boolean };
type Permission = { id: number; clientId: number; botId: number; toolName: string; allowed: boolean; requiresApproval: boolean };
type Approval = { id: number; clientId: number; botId: number; botName: string | null; toolName: string; toolInput: unknown; status: string; createdAt: string };
type BrandVoice = { id: number; clientId: number; toneDescription: string | null; prohibitedPhrases: string[]; requiredDisclaimers: string[] };
type Template = { id: number; clientId: number; name: string; description: string | null; permissions: Array<{ toolName: string; allowed: boolean; requiresApproval: boolean }> };
type BotInfo = { id: number; name: string; title: string; department: string };

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Governance() {
  const { user } = useAuth();
  const isAuthorized = user?.role === "owner" || user?.role === "admin";

  if (!isAuthorized) {
    return (
      <AppLayout title="Governance" subtitle="Bot permissions, approval gates, and brand voice">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Access restricted to account owners and admins.</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Governance" subtitle="Bot permissions, approval gates, and brand voice">
      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="permissions" className="data-[state=active]:bg-blue-600">
            <Shield className="w-4 h-4 mr-2" />Permissions
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-blue-600">
            <AlertTriangle className="w-4 h-4 mr-2" />Approvals
          </TabsTrigger>
          <TabsTrigger value="brand-voice" className="data-[state=active]:bg-blue-600">
            <Megaphone className="w-4 h-4 mr-2" />Brand Voice
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-blue-600">
            <Copy className="w-4 h-4 mr-2" />Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
        <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
        <TabsContent value="brand-voice"><BrandVoiceTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function PermissionsTab() {
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: bots, isLoading: botsLoading } = useQuery<BotInfo[]>({
    queryKey: ["bots-list"],
    queryFn: () => apiFetch("/bots"),
  });

  const { data: tools } = useQuery<ToolInfo[]>({
    queryKey: ["governance-tools"],
    queryFn: () => apiFetch("/governance/tools"),
  });

  const { data: permissions, isLoading: permsLoading } = useQuery<Permission[]>({
    queryKey: ["bot-permissions", selectedBotId],
    queryFn: () => apiFetch(`/governance/bots/${selectedBotId}/permissions`),
    enabled: !!selectedBotId,
  });

  const updateMutation = useMutation({
    mutationFn: (perms: Array<{ toolName: string; allowed: boolean; requiresApproval: boolean }>) =>
      apiFetch(`/governance/bots/${selectedBotId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: perms }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-permissions", selectedBotId] }),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/governance/bots/${selectedBotId}/permissions/seed`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-permissions", selectedBotId] }),
  });

  const permMap = new Map<string, Permission>();
  permissions?.forEach((p) => permMap.set(p.toolName, p));

  function toggleAllowed(toolName: string) {
    const current = permMap.get(toolName);
    const newPerms = (tools || []).map((t) => {
      const existing = permMap.get(t.name);
      if (t.name === toolName) {
        return { toolName: t.name, allowed: !(current?.allowed ?? false), requiresApproval: false };
      }
      return { toolName: t.name, allowed: existing?.allowed ?? false, requiresApproval: existing?.requiresApproval ?? false };
    });
    updateMutation.mutate(newPerms);
  }

  function toggleApproval(toolName: string) {
    const current = permMap.get(toolName);
    const newPerms = (tools || []).map((t) => {
      const existing = permMap.get(t.name);
      if (t.name === toolName) {
        return { toolName: t.name, allowed: existing?.allowed ?? false, requiresApproval: !(current?.requiresApproval ?? false) };
      }
      return { toolName: t.name, allowed: existing?.allowed ?? false, requiresApproval: existing?.requiresApproval ?? false };
    });
    updateMutation.mutate(newPerms);
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bot className="w-5 h-5" />Select Bot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select onValueChange={(v) => setSelectedBotId(Number(v))} value={selectedBotId?.toString() ?? ""}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Choose a bot to configure..." />
            </SelectTrigger>
            <SelectContent>
              {(bots || []).map((bot) => (
                <SelectItem key={bot.id} value={bot.id.toString()}>
                  {bot.name} — {bot.title} ({bot.department})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBotId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Reset to Department Defaults
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedBotId && (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white">Tool Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            {permsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
            ) : (
              <div className="space-y-3">
                {(tools || []).map((tool) => {
                  const perm = permMap.get(tool.name);
                  const allowed = perm?.allowed ?? (permissions?.length === 0);
                  const reqApproval = perm?.requiresApproval ?? false;

                  return (
                    <motion.div
                      key={tool.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg border ${allowed ? "bg-slate-700/30 border-slate-600/50" : "bg-red-900/10 border-red-800/30"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium text-sm">{tool.name}</span>
                            {tool.isSensitive && <Badge variant="destructive" className="text-xs">Sensitive</Badge>}
                          </div>
                          <p className="text-slate-400 text-xs mt-1">{tool.description}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-slate-400">Allowed</Label>
                            <Switch
                              checked={allowed}
                              onCheckedChange={() => toggleAllowed(tool.name)}
                              disabled={updateMutation.isPending}
                            />
                          </div>
                          {allowed && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-slate-400">Requires Approval</Label>
                              <Switch
                                checked={reqApproval}
                                onCheckedChange={() => toggleApproval(tool.name)}
                                disabled={updateMutation.isPending}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApprovalsTab() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const queryClient = useQueryClient();

  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ["approvals", statusFilter],
    queryFn: () => apiFetch(`/governance/approvals?status=${statusFilter}`),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/governance/approvals/${id}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/governance/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: "Rejected by owner" }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approvals"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : (approvals || []).length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-8 text-center text-slate-400">
            No {statusFilter} approvals
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(approvals || []).map((approval) => (
            <motion.div
              key={approval.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{approval.toolName}</span>
                        <Badge variant={approval.status === "pending" ? "secondary" : approval.status === "approved" ? "default" : "destructive"}>
                          {approval.status}
                        </Badge>
                      </div>
                      <p className="text-slate-400 text-sm mt-1">
                        Requested by <span className="text-blue-400">{approval.botName || `Bot #${approval.botId}`}</span>
                        {" · "}
                        {new Date(approval.createdAt).toLocaleString()}
                      </p>
                      {approval.toolInput && (
                        <pre className="text-xs text-slate-500 mt-2 bg-slate-900/50 p-2 rounded max-h-20 overflow-auto">
                          {JSON.stringify(approval.toolInput, null, 2)}
                        </pre>
                      )}
                    </div>
                    {approval.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => approveMutation.mutate(approval.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectMutation.mutate(approval.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" />Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandVoiceTab() {
  const queryClient = useQueryClient();
  const [tone, setTone] = useState("");
  const [phrases, setPhrases] = useState("");
  const [disclaimers, setDisclaimers] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: config, isLoading } = useQuery<BrandVoice | null>({
    queryKey: ["brand-voice"],
    queryFn: () => apiFetch("/governance/brand-voice"),
  });

  if (config && !loaded) {
    setTone(config.toneDescription || "");
    setPhrases((config.prohibitedPhrases || []).join("\n"));
    setDisclaimers((config.requiredDisclaimers || []).join("\n"));
    setLoaded(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/governance/brand-voice", {
        method: "PUT",
        body: JSON.stringify({
          toneDescription: tone || null,
          prohibitedPhrases: phrases.split("\n").map((p) => p.trim()).filter(Boolean),
          requiredDisclaimers: disclaimers.split("\n").map((d) => d.trim()).filter(Boolean),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brand-voice"] }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Megaphone className="w-5 h-5" />Brand Voice Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-slate-300">Tone Description</Label>
          <Textarea
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="e.g., Professional, warm, and authoritative. Avoid casual language."
            className="bg-slate-700 border-slate-600 text-white mt-1"
            rows={3}
          />
        </div>
        <div>
          <Label className="text-slate-300">Prohibited Phrases (one per line)</Label>
          <Textarea
            value={phrases}
            onChange={(e) => setPhrases(e.target.value)}
            placeholder="e.g., ASAP&#10;no-brainer&#10;circle back"
            className="bg-slate-700 border-slate-600 text-white mt-1"
            rows={4}
          />
        </div>
        <div>
          <Label className="text-slate-300">Required Disclaimers (one per line)</Label>
          <Textarea
            value={disclaimers}
            onChange={(e) => setDisclaimers(e.target.value)}
            placeholder="e.g., This is not financial advice.&#10;Results may vary."
            className="bg-slate-700 border-slate-600 text-white mt-1"
            rows={4}
          />
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Brand Voice
        </Button>
      </CardContent>
    </Card>
  );
}

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [applyBotId, setApplyBotId] = useState<number | null>(null);
  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null);

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => apiFetch("/governance/templates"),
  });

  const { data: bots } = useQuery<BotInfo[]>({
    queryKey: ["bots-list"],
    queryFn: () => apiFetch("/bots"),
  });

  const { data: tools } = useQuery<ToolInfo[]>({
    queryKey: ["governance-tools"],
    queryFn: () => apiFetch("/governance/tools"),
  });

  const { data: defaults } = useQuery<{ defaults: Record<string, { allowed: string[]; approvalRequired: string[] }>; readOnlyAnalystTools: string[]; sensitiveTools: string[] }>({
    queryKey: ["department-defaults"],
    queryFn: () => apiFetch("/governance/department-defaults"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissions: Array<{ toolName: string; allowed: boolean; requiresApproval: boolean }> }) =>
      apiFetch("/governance/templates", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/governance/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const applyMutation = useMutation({
    mutationFn: ({ templateId, botId }: { templateId: number; botId: number }) =>
      apiFetch(`/governance/templates/${templateId}/apply/${botId}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-permissions"] });
      setApplyBotId(null);
      setApplyTemplateId(null);
    },
  });

  function createReadOnlyTemplate() {
    if (!tools || !defaults) return;
    const perms = tools.map((t) => ({
      toolName: t.name,
      allowed: defaults.readOnlyAnalystTools.includes(t.name),
      requiresApproval: false,
    }));
    createMutation.mutate({ name: "Read-Only Analyst", description: "Read-only access — no write tools allowed", permissions: perms });
  }

  function createFullExecTemplate() {
    if (!tools) return;
    const perms = tools.map((t) => ({
      toolName: t.name,
      allowed: true,
      requiresApproval: false,
    }));
    createMutation.mutate({ name: "Full Executive", description: "Full access to all tools without approval gates", permissions: perms });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />Create Template</Button>
        <Button size="sm" variant="outline" onClick={createReadOnlyTemplate} disabled={createMutation.isPending}>
          Quick: Read-Only Analyst
        </Button>
        <Button size="sm" variant="outline" onClick={createFullExecTemplate} disabled={createMutation.isPending}>
          Quick: Full Executive
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
      ) : (templates || []).length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-8 text-center text-slate-400">
            No templates yet. Create one or use the quick-create buttons above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(templates || []).map((template) => (
            <Card key={template.id} className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium">{template.name}</span>
                    {template.description && <p className="text-slate-400 text-sm">{template.description}</p>}
                    <p className="text-slate-500 text-xs mt-1">
                      {(template.permissions || []).filter((p) => p.allowed).length} tools allowed,{" "}
                      {(template.permissions || []).filter((p) => p.requiresApproval).length} require approval
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setApplyTemplateId(template.id); setApplyBotId(null); }}
                    >
                      Apply to Bot
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(template.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader><DialogTitle>Create Permission Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-slate-700 border-slate-600" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="bg-slate-700 border-slate-600" />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!tools) return;
                const perms = tools.map((t) => ({ toolName: t.name, allowed: true, requiresApproval: false }));
                createMutation.mutate({ name: newName, description: newDesc, permissions: perms });
              }}
              disabled={!newName || createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!applyTemplateId} onOpenChange={() => setApplyTemplateId(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader><DialogTitle>Apply Template to Bot</DialogTitle></DialogHeader>
          <Select onValueChange={(v) => setApplyBotId(Number(v))}>
            <SelectTrigger className="bg-slate-700 border-slate-600">
              <SelectValue placeholder="Select a bot..." />
            </SelectTrigger>
            <SelectContent>
              {(bots || []).map((bot) => (
                <SelectItem key={bot.id} value={bot.id.toString()}>
                  {bot.name} — {bot.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              onClick={() => {
                if (applyTemplateId && applyBotId) {
                  applyMutation.mutate({ templateId: applyTemplateId, botId: applyBotId });
                }
              }}
              disabled={!applyBotId || applyMutation.isPending}
            >
              {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
