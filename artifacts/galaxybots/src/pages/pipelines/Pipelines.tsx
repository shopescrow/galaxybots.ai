import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Workflow, Play, Pause, Plus, Trash2, Bot, Loader2,
  CheckCircle, XCircle, Clock, Eye, ArrowRight, GripVertical,
  Webhook, MousePointer, Link2, ChevronDown, ChevronUp,
  Zap, Copy, RefreshCw, Shield, Radio, FileText, AlertCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BotInfo = { id: number; name: string; title: string; department: string };
type StepDef = { botId: number; instruction: string };
type StepWithBot = { id: number; pipelineId: number; stepOrder: number; botId: number; instruction: string; bot: BotInfo | null };
type RunSummary = { id: number; pipelineId: number; status: string; triggerType: string; startedAt: string | null; completedAt: string | null; createdAt: string };
type TriggerData = {
  id: number; pipelineId: number; triggerType: string; endpointSlug: string;
  signingSecret: string; label: string | null; active: boolean; createdAt: string;
};
type TriggerEventData = {
  id: number; triggerId: number; pipelineId: number; receivedAt: string;
  payloadPreview: string | null; status: string; errorMessage: string | null;
  runId: number | null; createdAt: string;
};
type PipelineData = {
  id: number; clientId: number; name: string; triggerType: string; triggerConfig: Record<string, unknown>;
  active: boolean; createdAt: string; updatedAt: string; steps: StepWithBot[]; recentRuns: RunSummary[];
  triggers?: TriggerData[];
};
type RunStepDetail = {
  id: number; runId: number; stepId: number; botId: number; stepOrder: number;
  instruction: string; status: string; output: string | null;
  startedAt: string | null; completedAt: string | null; bot: BotInfo | null;
};
type RunDetail = RunSummary & { pipeline: PipelineData; steps: RunStepDetail[] };

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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
    done: { variant: "default", icon: CheckCircle },
    success: { variant: "default", icon: CheckCircle },
    running: { variant: "secondary", icon: Loader2 },
    pending: { variant: "outline", icon: Clock },
    failed: { variant: "destructive", icon: XCircle },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1">
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {status}
    </Badge>
  );
}

function TriggerIcon({ type }: { type: string }) {
  if (type === "webhook") return <Webhook className="w-4 h-4" />;
  if (type === "pipeline_completion") return <Link2 className="w-4 h-4" />;
  if (type === "stripe") return <Zap className="w-4 h-4" />;
  if (type === "twilio") return <Radio className="w-4 h-4" />;
  if (type === "form") return <FileText className="w-4 h-4" />;
  if (type === "generic") return <Zap className="w-4 h-4" />;
  return <MousePointer className="w-4 h-4" />;
}

function TriggerTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    generic: "HTTP POST",
    stripe: "Stripe Event",
    twilio: "Twilio SMS/Call",
    form: "Form Embed",
  };
  return <>{labels[type] || type}</>;
}

export default function Pipelines() {
  const { user } = useAuth();
  const isAuthorized = user?.role === "owner" || user?.role === "admin";
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<PipelineData | null>(null);
  const [viewingRun, setViewingRun] = useState<number | null>(null);
  const [expandedPipeline, setExpandedPipeline] = useState<number | null>(null);
  const [triggersPipeline, setTriggersPipeline] = useState<PipelineData | null>(null);

  const { data: pipelines = [], isLoading } = useQuery<PipelineData[]>({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch("/pipelines"),
    enabled: isAuthorized,
  });

  const { data: bots = [] } = useQuery<BotInfo[]>({
    queryKey: ["bots-list"],
    queryFn: () => apiFetch("/bots"),
    enabled: isAuthorized,
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pipelines/${id}/toggle`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pipelines/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });

  const runMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pipelines/${id}/run`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });

  if (!isAuthorized) {
    return (
      <AppLayout title="Pipelines" subtitle="Multi-bot automated workflows">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-12 text-center">
            <Workflow className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Access restricted to account owners and admins.</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Pipelines" subtitle="Multi-bot automated workflows triggered by events">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-slate-400 text-sm">
            Define automated sequences where bots execute tasks in order, triggered by webhooks, events, forms, or manual runs.
          </p>
          <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />New Pipeline
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : pipelines.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="py-12 text-center">
              <Workflow className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">No pipelines yet. Create your first automated workflow.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pipelines.map((pipeline) => (
              <motion.div key={pipeline.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Workflow className="w-5 h-5 text-blue-400" />
                        <CardTitle className="text-lg text-white">{pipeline.name}</CardTitle>
                        <Badge variant={pipeline.active ? "default" : "secondary"} className="gap-1">
                          {pipeline.active ? "Active" : "Paused"}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <TriggerIcon type={pipeline.triggerType} />
                          {pipeline.triggerType === "pipeline_completion" ? "On Completion" : pipeline.triggerType}
                        </Badge>
                        {(pipeline.triggers?.length ?? 0) > 0 && (
                          <Badge variant="outline" className="gap-1 text-green-400 border-green-700">
                            <Zap className="w-3 h-3" />
                            {pipeline.triggers!.length} trigger{pipeline.triggers!.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={pipeline.active}
                          onCheckedChange={() => toggleMutation.mutate(pipeline.id)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTriggersPipeline(pipeline)}
                          className="border-slate-600 gap-1"
                        >
                          <Zap className="w-4 h-4" />
                          Triggers
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runMutation.mutate(pipeline.id)}
                          disabled={!pipeline.active || runMutation.isPending}
                          className="border-slate-600"
                        >
                          {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          <span className="ml-1">Run Now</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingPipeline(pipeline)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => { if (confirm("Delete this pipeline?")) deleteMutation.mutate(pipeline.id); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {pipeline.steps.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-2">
                          <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-3 py-1.5 text-sm">
                            <Bot className="w-4 h-4 text-blue-400" />
                            <span className="text-white font-medium">{step.bot?.name || `Bot #${step.botId}`}</span>
                            <span className="text-slate-400 max-w-[200px] truncate">{step.instruction}</span>
                          </div>
                          {i < pipeline.steps.length - 1 && <ArrowRight className="w-4 h-4 text-slate-500" />}
                        </div>
                      ))}
                    </div>

                    {pipeline.recentRuns.length > 0 && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-2"
                          onClick={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
                        >
                          {expandedPipeline === pipeline.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          Recent Runs ({pipeline.recentRuns.length})
                        </button>
                        {expandedPipeline === pipeline.id && (
                          <div className="space-y-2">
                            {pipeline.recentRuns.map((run) => (
                              <div
                                key={run.id}
                                className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-2 cursor-pointer hover:bg-slate-700/50"
                                onClick={() => setViewingRun(run.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <StatusBadge status={run.status} />
                                  <span className="text-sm text-slate-300">Run #{run.id}</span>
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <TriggerIcon type={run.triggerType} />
                                    {run.triggerType}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">
                                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : "Not started"}
                                  </span>
                                  <Eye className="w-4 h-4 text-slate-400" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <PipelineFormDialog
          bots={bots}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ["pipelines"] }); }}
        />
      )}

      {editingPipeline && (
        <PipelineFormDialog
          bots={bots}
          pipeline={editingPipeline}
          onClose={() => setEditingPipeline(null)}
          onSaved={() => { setEditingPipeline(null); queryClient.invalidateQueries({ queryKey: ["pipelines"] }); }}
        />
      )}

      {viewingRun !== null && (
        <RunDetailDialog runId={viewingRun} onClose={() => setViewingRun(null)} />
      )}

      {triggersPipeline && (
        <TriggersDialog
          pipeline={triggersPipeline}
          onClose={() => { setTriggersPipeline(null); queryClient.invalidateQueries({ queryKey: ["pipelines"] }); }}
        />
      )}
    </AppLayout>
  );
}

function PipelineFormDialog({
  bots,
  pipeline,
  onClose,
  onSaved,
}: {
  bots: BotInfo[];
  pipeline?: PipelineData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(pipeline?.name || "");
  const [triggerType, setTriggerType] = useState(pipeline?.triggerType || "manual");
  const [active, setActive] = useState(pipeline?.active ?? true);
  const [sourcePipelineId, setSourcePipelineId] = useState<string>(
    String((pipeline?.triggerConfig as Record<string, unknown>)?.sourcePipelineId || "")
  );
  const [steps, setSteps] = useState<StepDef[]>(
    pipeline?.steps.map((s) => ({ botId: s.botId, instruction: s.instruction })) || [{ botId: 0, instruction: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: allPipelines = [] } = useQuery<PipelineData[]>({
    queryKey: ["pipelines"],
    queryFn: () => apiFetch("/pipelines"),
  });

  const addStep = () => setSteps([...steps, { botId: 0, instruction: "" }]);
  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: keyof StepDef, value: string | number) => {
    const updated = [...steps];
    if (field === "botId") updated[idx] = { ...updated[idx], botId: Number(value) };
    else updated[idx] = { ...updated[idx], [field]: value };
    setSteps(updated);
  };

  const moveStep = (idx: number, direction: "up" | "down") => {
    const updated = [...steps];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= updated.length) return;
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    setSteps(updated);
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (steps.some((s) => !s.botId || !s.instruction.trim())) { setError("All steps need a bot and instruction"); return; }

    const triggerConfig: Record<string, unknown> = {};
    if (triggerType === "pipeline_completion" && sourcePipelineId) {
      triggerConfig.sourcePipelineId = Number(sourcePipelineId);
    }

    setSaving(true);
    try {
      if (pipeline) {
        await apiFetch(`/pipelines/${pipeline.id}`, {
          method: "PUT",
          body: JSON.stringify({ name, triggerType, triggerConfig, active, steps }),
        });
      } else {
        await apiFetch("/pipelines", {
          method: "POST",
          body: JSON.stringify({ name, triggerType, triggerConfig, active, steps }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pipeline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">{pipeline ? "Edit Pipeline" : "Create Pipeline"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Pipeline Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New Client Onboarding"
              className="bg-slate-900/50 border-slate-600 text-white"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-slate-300">Trigger Type</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="manual">Manual (Run Now)</SelectItem>
                  <SelectItem value="webhook">Incoming Webhook</SelectItem>
                  <SelectItem value="pipeline_completion">On Pipeline Completion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Label className="text-slate-300 mb-2">Active</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          {triggerType === "pipeline_completion" && (
            <div>
              <Label className="text-slate-300">Source Pipeline (triggers this pipeline when it completes)</Label>
              <Select value={sourcePipelineId} onValueChange={setSourcePipelineId}>
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                  <SelectValue placeholder="Any pipeline (leave empty) or select one..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="">Any pipeline</SelectItem>
                  {allPipelines
                    .filter((p) => p.id !== pipeline?.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-slate-300">Steps (executed in order)</Label>
              <Button size="sm" variant="outline" onClick={addStep} className="border-slate-600">
                <Plus className="w-4 h-4 mr-1" />Add Step
              </Button>
            </div>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-start bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                  <div className="flex flex-col gap-1 pt-2">
                    <button
                      onClick={() => moveStep(idx, "up")}
                      disabled={idx === 0}
                      className="text-slate-500 hover:text-white disabled:opacity-30"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <GripVertical className="w-4 h-4 text-slate-600" />
                    <button
                      onClick={() => moveStep(idx, "down")}
                      disabled={idx === steps.length - 1}
                      className="text-slate-500 hover:text-white disabled:opacity-30"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Step {idx + 1}</Badge>
                      <Select value={String(step.botId || "")} onValueChange={(v) => updateStep(idx, "botId", Number(v))}>
                        <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white flex-1">
                          <SelectValue placeholder="Select a bot..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {bots.map((bot) => (
                            <SelectItem key={bot.id} value={String(bot.id)}>
                              {bot.name} — {bot.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      value={step.instruction}
                      onChange={(e) => updateStep(idx, "instruction", e.target.value)}
                      placeholder="What should this bot do in this step?"
                      rows={2}
                      className="bg-slate-800/50 border-slate-600 text-white"
                    />
                  </div>
                  {steps.length > 1 && (
                    <Button size="sm" variant="ghost" className="text-red-400 mt-2" onClick={() => removeStep(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {pipeline ? "Save Changes" : "Create Pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TriggersDialog({
  pipeline,
  onClose,
}: {
  pipeline: PipelineData;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [addingType, setAddingType] = useState<string>("");
  const [addingLabel, setAddingLabel] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"triggers" | "events">("triggers");

  const { data: triggers = [], isLoading: triggersLoading } = useQuery<TriggerData[]>({
    queryKey: ["pipeline-triggers", pipeline.id],
    queryFn: () => apiFetch(`/pipelines/${pipeline.id}/triggers`),
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<TriggerEventData[]>({
    queryKey: ["pipeline-trigger-events", pipeline.id],
    queryFn: () => apiFetch(`/pipelines/${pipeline.id}/trigger-events`),
    enabled: activeTab === "events",
  });

  const createMutation = useMutation({
    mutationFn: (data: { triggerType: string; label: string }) =>
      apiFetch(`/pipelines/${pipeline.id}/triggers`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-triggers", pipeline.id] });
      setAddingType("");
      setAddingLabel("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (triggerId: number) =>
      apiFetch(`/pipelines/${pipeline.id}/triggers/${triggerId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-triggers", pipeline.id] }),
  });

  const toggleTriggerMutation = useMutation({
    mutationFn: ({ triggerId, active }: { triggerId: number; active: boolean }) =>
      apiFetch(`/pipelines/${pipeline.id}/triggers/${triggerId}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-triggers", pipeline.id] }),
  });

  const rotateMutation = useMutation({
    mutationFn: (triggerId: number) =>
      apiFetch(`/pipelines/${pipeline.id}/triggers/${triggerId}/rotate-secret`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipeline-triggers", pipeline.id] }),
  });

  const triggerUrl = (slug: string) => {
    const origin = window.location.origin;
    return `${origin}${BASE}/api/triggers/${slug}`;
  };

  const copyToClipboard = (text: string, triggerId: number, type: "url" | "secret") => {
    navigator.clipboard.writeText(text);
    if (type === "url") {
      setCopiedId(triggerId);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopiedSecretId(triggerId);
      setTimeout(() => setCopiedSecretId(null), 2000);
    }
  };

  const formSnippet = (slug: string, secret: string) => {
    const url = triggerUrl(slug);
    return `<form id="trigger-form" onsubmit="event.preventDefault();fetch('${url}',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer ${secret}'},body:JSON.stringify(Object.fromEntries(new FormData(this)))}).then(r=>r.json()).then(d=>alert('Submitted!')).catch(e=>alert('Error: '+e.message))">
  <input name="name" placeholder="Name" required style="display:block;margin:4px 0;padding:8px;width:100%"/>
  <input name="email" placeholder="Email" required style="display:block;margin:4px 0;padding:8px;width:100%"/>
  <textarea name="message" placeholder="Message" style="display:block;margin:4px 0;padding:8px;width:100%"></textarea>
  <button type="submit" style="margin-top:8px;padding:8px 16px;cursor:pointer">Submit</button>
</form>`;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Event Triggers — {pipeline.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            size="sm"
            variant={activeTab === "triggers" ? "default" : "outline"}
            onClick={() => setActiveTab("triggers")}
            className={activeTab === "triggers" ? "bg-blue-600" : "border-slate-600"}
          >
            <Zap className="w-4 h-4 mr-1" />
            Triggers ({triggers.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "events" ? "default" : "outline"}
            onClick={() => setActiveTab("events")}
            className={activeTab === "events" ? "bg-blue-600" : "border-slate-600"}
          >
            <Clock className="w-4 h-4 mr-1" />
            Event Log
          </Button>
        </div>

        {activeTab === "triggers" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Select value={addingType} onValueChange={setAddingType}>
                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white w-48">
                  <SelectValue placeholder="Add trigger..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="generic">Generic HTTP POST</SelectItem>
                  <SelectItem value="stripe">Stripe Event</SelectItem>
                  <SelectItem value="twilio">Twilio SMS/Call</SelectItem>
                  <SelectItem value="form">Form Embed</SelectItem>
                </SelectContent>
              </Select>
              {addingType && (
                <>
                  <Input
                    value={addingLabel}
                    onChange={(e) => setAddingLabel(e.target.value)}
                    placeholder="Label (optional)"
                    className="bg-slate-900/50 border-slate-600 text-white flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => createMutation.mutate({ triggerType: addingType, label: addingLabel })}
                    disabled={createMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </>
              )}
            </div>

            {triggersLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : triggers.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No triggers configured. Add one above to receive external events.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {triggers.map((trigger) => (
                  <Card key={trigger.id} className="bg-slate-900/50 border-slate-700/50">
                    <CardContent className="py-3 px-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TriggerIcon type={trigger.triggerType} />
                          <span className="text-white font-medium">{trigger.label || <TriggerTypeLabel type={trigger.triggerType} />}</span>
                          <Badge variant="outline" className="text-xs">
                            <TriggerTypeLabel type={trigger.triggerType} />
                          </Badge>
                          <Switch
                            checked={trigger.active}
                            onCheckedChange={(checked) => toggleTriggerMutation.mutate({ triggerId: trigger.id, active: checked })}
                          />
                          <Badge variant={trigger.active ? "default" : "secondary"} className="text-xs">
                            {trigger.active ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Rotate signing secret? The old secret will stop working immediately.")) {
                                rotateMutation.mutate(trigger.id);
                              }
                            }}
                            className="text-slate-400 hover:text-white"
                            title="Rotate Secret"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => { if (confirm("Delete this trigger?")) deleteMutation.mutate(trigger.id); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-slate-500">Endpoint URL</Label>
                          <div className="flex items-center gap-2">
                            <code className="bg-slate-800 text-green-400 px-3 py-1.5 rounded text-xs flex-1 overflow-x-auto">
                              {triggerUrl(trigger.endpointSlug)}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(triggerUrl(trigger.endpointSlug), trigger.id, "url")}
                              className="text-slate-400"
                            >
                              {copiedId === trigger.id ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-slate-500 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Signing Secret
                          </Label>
                          <div className="flex items-center gap-2">
                            <code className="bg-slate-800 text-yellow-400 px-3 py-1.5 rounded text-xs flex-1 overflow-x-auto font-mono">
                              {trigger.signingSecret}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(trigger.signingSecret, trigger.id, "secret")}
                              className="text-slate-400"
                            >
                              {copiedSecretId === trigger.id ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>

                        {trigger.triggerType === "generic" && (
                          <div className="bg-slate-800/50 rounded p-3 text-xs text-slate-400">
                            <p className="mb-1 font-medium text-slate-300">Usage (cURL):</p>
                            <code className="text-green-400 whitespace-pre-wrap break-all">
{`curl -X POST ${triggerUrl(trigger.endpointSlug)} \\
  -H "Authorization: Bearer ${trigger.signingSecret}" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`}
                            </code>
                          </div>
                        )}

                        {trigger.triggerType === "stripe" && (
                          <div className="bg-slate-800/50 rounded p-3 text-xs text-slate-400">
                            <p className="font-medium text-slate-300 mb-1">Stripe Setup:</p>
                            <p>Configure this URL as a webhook endpoint in your Stripe Dashboard. Use the signing secret above as the HMAC verification key.</p>
                          </div>
                        )}

                        {trigger.triggerType === "twilio" && (
                          <div className="bg-slate-800/50 rounded p-3 text-xs text-slate-400">
                            <p className="font-medium text-slate-300 mb-1">Twilio Setup:</p>
                            <p>Set this URL as your Twilio webhook for SMS/voice. Use Basic auth with the signing secret as password.</p>
                          </div>
                        )}

                        {trigger.triggerType === "form" && (
                          <div className="bg-slate-800/50 rounded p-3 text-xs text-slate-400">
                            <p className="font-medium text-slate-300 mb-1">Embed Snippet:</p>
                            <code className="text-green-400 whitespace-pre-wrap break-all">
                              {formSnippet(trigger.endpointSlug, trigger.signingSecret)}
                            </code>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "events" && (
          <div className="space-y-3">
            {eventsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : events.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No trigger events recorded yet.</p>
              </div>
            ) : (
              events.map((event) => (
                <Card key={event.id} className={`border ${
                  event.status === "success" ? "border-green-700/50 bg-green-900/10" :
                  event.status === "failed" ? "border-red-700/50 bg-red-900/10" :
                  "border-slate-700/50 bg-slate-900/50"
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={event.status} />
                        <span className="text-sm text-slate-300">Event #{event.id}</span>
                        {event.runId && (
                          <Badge variant="outline" className="text-xs">Run #{event.runId}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(event.receivedAt).toLocaleString()}
                      </span>
                    </div>
                    {event.errorMessage && (
                      <div className="flex items-start gap-2 text-xs text-red-400 mb-2">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        {event.errorMessage}
                      </div>
                    )}
                    {event.payloadPreview && (
                      <div className="bg-slate-900/50 rounded p-2 text-xs text-slate-400 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                        {event.payloadPreview}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunDetailDialog({ runId, onClose }: { runId: number; onClose: () => void }) {
  const { data: run, isLoading } = useQuery<RunDetail>({
    queryKey: ["pipeline-run", runId],
    queryFn: () => apiFetch(`/pipelines/runs/${runId}`),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.status === "running" || d.status === "pending") ? 3000 : false;
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            Run #{runId}
            {run && <StatusBadge status={run.status} />}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : !run ? (
          <p className="text-slate-400 text-center py-8">Run not found.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>Pipeline: <span className="text-white">{run.pipeline?.name}</span></span>
              <Badge variant="outline" className="gap-1">
                <TriggerIcon type={run.triggerType} />
                {run.triggerType}
              </Badge>
              {run.startedAt && <span>Started: {new Date(run.startedAt).toLocaleString()}</span>}
              {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
            </div>

            <div className="space-y-3">
              {run.steps.map((step) => (
                <Card key={step.id} className={`border ${
                  step.status === "done" ? "border-green-700/50 bg-green-900/10" :
                  step.status === "running" ? "border-blue-700/50 bg-blue-900/10" :
                  step.status === "failed" ? "border-red-700/50 bg-red-900/10" :
                  "border-slate-700/50 bg-slate-900/50"
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Step {step.stepOrder}</Badge>
                        <Bot className="w-4 h-4 text-blue-400" />
                        <span className="text-white font-medium">{step.bot?.name || `Bot #${step.botId}`}</span>
                      </div>
                      <StatusBadge status={step.status} />
                    </div>
                    <p className="text-sm text-slate-400 mb-2">{step.instruction}</p>
                    {step.output && (
                      <div className="bg-slate-900/50 rounded p-3 text-sm text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {step.output}
                      </div>
                    )}
                    {step.startedAt && (
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span>Started: {new Date(step.startedAt).toLocaleString()}</span>
                        {step.completedAt && <span>Completed: {new Date(step.completedAt).toLocaleString()}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
