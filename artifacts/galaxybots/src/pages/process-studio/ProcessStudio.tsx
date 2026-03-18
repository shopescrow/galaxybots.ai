import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Plus,
  Play,
  Copy,
  Trash2,
  Settings,
  Zap,
  GitBranch,
  Clock,
  Bell,
  ChevronRight,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Workflow,
  ArrowRight,
} from "lucide-react";
import { useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type WorkflowType = {
  id: number;
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  nodes: unknown[];
  edges: unknown[];
  enabled: boolean;
  isBuiltIn: boolean;
  lastRunAt?: string | null;
  runCount: number;
  createdAt: string;
};

type NodeData = {
  label: string;
  nodeType: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
};

const NODE_CATEGORIES = {
  trigger: {
    label: "Triggers",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/40",
    nodes: [
      { type: "trigger", subType: "webhook", label: "Webhook Received" },
      { type: "trigger", subType: "prospect_qualified", label: "Prospect Qualified" },
      { type: "trigger", subType: "aeo_score_changed", label: "AEO Score Changed" },
      { type: "trigger", subType: "schedule", label: "Schedule (Cron)" },
      { type: "trigger", subType: "new_client_created", label: "New Client Created" },
      { type: "trigger", subType: "approval_completed", label: "Approval Completed" },
      { type: "trigger", subType: "email_received", label: "Email Received" },
      { type: "trigger", subType: "twilio_call_ended", label: "Twilio Call Ended" },
    ],
  },
  action: {
    label: "Actions",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/40",
    nodes: [
      { type: "action", subType: "send_message_to_bot", label: "Send Message to Bot" },
      { type: "action", subType: "deploy_team", label: "Deploy Team" },
      { type: "action", subType: "send_email", label: "Send Email" },
      { type: "action", subType: "post_to_slack", label: "Post to Slack" },
      { type: "action", subType: "create_hubspot_deal", label: "Create HubSpot Deal" },
      { type: "action", subType: "update_prospect_status", label: "Update Prospect Status" },
      { type: "action", subType: "generate_bingolingo", label: "Generate BingoLingo Content" },
      { type: "action", subType: "request_aeo_scan", label: "Request AEO Scan" },
      { type: "action", subType: "create_calendar_event", label: "Create Calendar Event" },
      { type: "action", subType: "send_notification", label: "Send Notification" },
    ],
  },
  logic: {
    label: "Logic",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/40",
    nodes: [
      { type: "condition", subType: "if_else", label: "Condition (If/Else)" },
      { type: "delay", subType: "wait", label: "Delay (Wait)" },
      { type: "split", subType: "fan_out", label: "Split (Fan Out)" },
      { type: "merge", subType: "wait_all", label: "Merge (Wait All)" },
    ],
  },
  output: {
    label: "Outputs",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/40",
    nodes: [
      { type: "output", subType: "notify_owner", label: "Notify Owner" },
      { type: "output", subType: "create_brief", label: "Create Morning Brief Entry" },
      { type: "output", subType: "log_audit", label: "Log to Audit Trail" },
    ],
  },
};

const NODE_TYPE_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  trigger: { color: "border-violet-500/60 bg-violet-500/10", icon: <Zap className="w-3 h-3 text-violet-400" /> },
  action: { color: "border-cyan-500/60 bg-cyan-500/10", icon: <ArrowRight className="w-3 h-3 text-cyan-400" /> },
  condition: { color: "border-amber-500/60 bg-amber-500/10", icon: <GitBranch className="w-3 h-3 text-amber-400" /> },
  delay: { color: "border-blue-500/60 bg-blue-500/10", icon: <Clock className="w-3 h-3 text-blue-400" /> },
  split: { color: "border-orange-500/60 bg-orange-500/10", icon: <GitBranch className="w-3 h-3 text-orange-400" /> },
  merge: { color: "border-purple-500/60 bg-purple-500/10", icon: <GitBranch className="w-3 h-3 text-purple-400" /> },
  output: { color: "border-green-500/60 bg-green-500/10", icon: <Bell className="w-3 h-3 text-green-400" /> },
};

function CustomNode({ data }: { data: NodeData }) {
  const cfg = NODE_TYPE_CONFIG[data.nodeType] ?? NODE_TYPE_CONFIG.action;
  const isTrigger = data.nodeType === "trigger";
  const isOutput = data.nodeType === "output";
  const isCondition = data.nodeType === "condition";
  return (
    <div className={`px-3 py-2 rounded-lg border min-w-[140px] max-w-[180px] ${cfg.color} cursor-pointer relative`}>
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-border !bg-background"
        />
      )}
      <div className="flex items-center gap-1.5">
        {cfg.icon}
        <span className="text-xs font-medium truncate text-foreground">{data.label}</span>
      </div>
      {data.config?.expression && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{String(data.config.expression)}</p>
      )}
      {!isOutput && !isCondition && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !border-border !bg-background"
        />
      )}
      {isCondition && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: "30%" }}
            className="!w-3 !h-3 !border-2 !border-green-500 !bg-background"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: "70%" }}
            className="!w-3 !h-3 !border-2 !border-red-500 !bg-background"
          />
        </>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

function WorkflowCard({ workflow, onSelect, onToggle, onRun, onClone, onDelete, isSelected }: {
  workflow: WorkflowType;
  onSelect: () => void;
  onToggle: () => void;
  onRun: () => void;
  onClone: () => void;
  onDelete: () => void;
  isSelected: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-xl border cursor-pointer transition-colors ${
        isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 hover:border-primary/30"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {workflow.isBuiltIn && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
            <span className="text-sm font-medium truncate">{workflow.name}</span>
          </div>
          {workflow.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{workflow.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[9px]">{workflow.triggerType}</Badge>
            {workflow.runCount > 0 && (
              <Badge variant="secondary" className="text-[9px]">{workflow.runCount} runs</Badge>
            )}
            {workflow.lastRunAt && (
              <span className="text-[10px] text-muted-foreground">
                Last: {formatDistanceToNow(new Date(workflow.lastRunAt), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        <Switch
          checked={workflow.enabled}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0"
        />
      </div>
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/30">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 flex-1"
          onClick={(e) => { e.stopPropagation(); onRun(); }}
        >
          <Play className="w-3 h-3 mr-1" />
          Run
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7"
          onClick={(e) => { e.stopPropagation(); onClone(); }}
        >
          <Copy className="w-3 h-3" />
        </Button>
        {!workflow.isBuiltIn && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

let nodeIdCounter = 100;

function ProcessStudioInner() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowType | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTriggerType, setNewTriggerType] = useState("manual");
  const [isDirty, setIsDirty] = useState(false);

  const { data: workflows = [], isLoading } = useQuery<WorkflowType[]>({
    queryKey: ["workflows"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/workflows`, { headers });
      if (!res.ok) throw new Error("Failed to load workflows");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<WorkflowType>) => {
      const res = await fetch(`${BASE}/api/workflows`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      return res.json();
    },
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setShowNewWorkflow(false);
      setNewName("");
      setNewDesc("");
      selectWorkflow(wf);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<WorkflowType> }) => {
      const res = await fetch(`${BASE}/api/workflows/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update workflow");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setIsDirty(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const endpoint = enabled ? "disable" : "enable";
      const res = await fetch(`${BASE}/api/workflows/${id}/${endpoint}`, { method: "POST", headers });
      if (!res.ok) throw new Error("Failed to toggle workflow");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const runMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/workflows/${id}/run`, { method: "POST", headers, body: "{}" });
      if (!res.ok) throw new Error("Failed to run workflow");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const cloneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/workflows/${id}/clone`, { method: "POST", headers, body: "{}" });
      if (!res.ok) throw new Error("Failed to clone workflow");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/workflows/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Failed to delete workflow");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      if (selectedWorkflow) setSelectedWorkflow(null);
    },
  });

  const normalizeNode = (n: Node<NodeData>): Node<NodeData> => {
    const rawType = n.type as string;
    const nodeType = n.data.nodeType ?? (rawType === "trigger" ? "trigger" : rawType === "output" ? "output" : rawType === "condition" ? "condition" : rawType === "delay" ? "delay" : "action");
    const subType = (n.data.subType as string) ?? (n.data.actionType as string) ?? (n.data.triggerType as string) ?? (n.data.outputType as string) ?? nodeType;
    const existingConfig = (n.data.config as Record<string, unknown>) ?? {};
    const extraFromData: Record<string, unknown> = {};
    if (n.data.botName) extraFromData.botName = n.data.botName;
    if (n.data.message) extraFromData.message = n.data.message;
    if (n.data.channel) extraFromData.channel = n.data.channel;
    if (n.data.cron) extraFromData.cron = n.data.cron;
    return { ...n, type: "custom", data: { ...n.data, nodeType, subType, config: { ...extraFromData, ...existingConfig } } };
  };

  const selectWorkflow = useCallback((workflow: WorkflowType) => {
    setSelectedWorkflow(workflow);
    setSelectedNode(null);
    setIsDirty(false);
    const wfNodes = (workflow.nodes ?? []) as Node<NodeData>[];
    const wfEdges = (workflow.edges ?? []) as Edge[];
    const tc = workflow.triggerConfig ?? {};
    const hydratedNodes = wfNodes.map((n: Node<NodeData>) => {
      const normalized = normalizeNode(n);
      if (normalized.data.nodeType !== "trigger") return normalized;
      return { ...normalized, data: { ...normalized.data, config: { ...(normalized.data.config ?? {}), ...tc } } };
    });
    setNodes(hydratedNodes);
    setEdges(wfEdges);
  }, [setNodes, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds));
    setIsDirty(true);
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<NodeData>) => {
    setSelectedNode(node);
  }, []);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const addNodeToCanvas = useCallback((nodeType: string, label: string, subType?: string, position?: { x: number; y: number }) => {
    const id = `n${++nodeIdCounter}`;
    const pos = position ?? { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 };
    const newNode: Node<NodeData> = {
      id,
      type: "custom",
      position: pos,
      data: { label, nodeType, subType: subType ?? nodeType, config: {} },
    };
    setNodes((nds) => [...nds, newNode]);
    setIsDirty(true);
  }, [setNodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/reactflow");
    if (!raw) return;
    try {
      const { nodeType, label, subType } = JSON.parse(raw) as { nodeType: string; label: string; subType: string };
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeToCanvas(nodeType, label, subType, position);
    } catch {
      // ignore bad drag data
    }
  }, [screenToFlowPosition, addNodeToCanvas]);

  const updateNodeData = useCallback((key: string, value: unknown) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => {
      if (n.id !== selectedNode.id) return n;
      return { ...n, data: { ...n.data, config: { ...(n.data.config ?? {}), [key]: value } } };
    }));
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, config: { ...(prev.data.config ?? {}), [key]: value } } } : null);
    setIsDirty(true);
  }, [selectedNode, setNodes]);

  const saveWorkflow = useCallback(() => {
    if (!selectedWorkflow || selectedWorkflow.isBuiltIn) return;
    const triggerNode = nodes.find((n: Node<NodeData>) => n.data.nodeType === "trigger");
    const rawCfg = (triggerNode?.data.config ?? {}) as Record<string, unknown>;
    const subType = (triggerNode?.data.subType as string) ?? selectedWorkflow.triggerType;
    const derivedTriggerConfig: Record<string, unknown> = {};
    if (rawCfg.botId) derivedTriggerConfig.botId = rawCfg.botId;
    if (subType === "schedule" && (rawCfg.cron ?? rawCfg.cronExpression)) derivedTriggerConfig.cron = rawCfg.cron ?? rawCfg.cronExpression;
    if (subType === "aeo_score_changed" && rawCfg.minDropPoints) derivedTriggerConfig.minDropPoints = rawCfg.minDropPoints;
    if (subType === "prospect_qualified" && rawCfg.minScore) derivedTriggerConfig.minScore = rawCfg.minScore;
    if (subType === "webhook" && rawCfg.filterField) derivedTriggerConfig.filterField = rawCfg.filterField;
    updateMutation.mutate({
      id: selectedWorkflow.id,
      data: {
        nodes: nodes as unknown[],
        edges: edges as unknown[],
        ...(triggerNode ? { triggerType: subType, triggerConfig: derivedTriggerConfig } : {}),
      },
    });
  }, [selectedWorkflow, nodes, edges, updateMutation]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
    setIsDirty(true);
  }, [selectedNode, setNodes, setEdges]);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Workflow className="w-6 h-6 text-primary" />
              Process Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Build and manage automated workflows visually</p>
          </div>
          <Button onClick={() => setShowNewWorkflow(true)} className="gap-1">
            <Plus className="w-4 h-4" />
            New Workflow
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 border-r border-border/50 flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 border-b border-border/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workflows</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : workflows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No workflows yet</div>
              ) : (
                workflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    isSelected={selectedWorkflow?.id === wf.id}
                    onSelect={() => selectWorkflow(wf)}
                    onToggle={() => toggleMutation.mutate({ id: wf.id, enabled: wf.enabled })}
                    onRun={() => runMutation.mutate(wf.id)}
                    onClone={() => cloneMutation.mutate(wf.id)}
                    onDelete={() => deleteMutation.mutate(wf.id)}
                  />
                ))
              )}
            </div>
          </div>

          {selectedWorkflow ? (
            <>
              <div className="w-48 border-r border-border/50 flex flex-col shrink-0 overflow-hidden">
                <div className="p-3 border-b border-border/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node Library</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-3">
                  {Object.entries(NODE_CATEGORIES).map(([catKey, cat]) => (
                    <div key={catKey}>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${cat.color}`}>{cat.label}</p>
                      <div className="space-y-1">
                        {cat.nodes.map((n) => (
                          <div
                            key={n.subType}
                            className={`w-full text-left px-2 py-1.5 rounded text-xs border transition-colors hover:opacity-80 cursor-grab active:cursor-grabbing select-none ${cat.bg} ${selectedWorkflow.isBuiltIn ? "opacity-40 pointer-events-none" : ""}`}
                            draggable={!selectedWorkflow.isBuiltIn}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType: n.type, label: n.label, subType: n.subType }));
                            }}
                            onClick={() => !selectedWorkflow.isBuiltIn && addNodeToCanvas(n.type, n.label, n.subType)}
                          >
                            {n.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-2 border-b border-border/30 flex items-center justify-between shrink-0 bg-background/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{selectedWorkflow.name}</span>
                    {selectedWorkflow.isBuiltIn && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground gap-1">
                        <Lock className="w-2.5 h-2.5" /> Template
                      </Badge>
                    )}
                    {isDirty && <Badge variant="secondary" className="text-[9px]">Unsaved</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedWorkflow.isBuiltIn && (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!isDirty || updateMutation.isPending}
                        onClick={saveWorkflow}
                      >
                        {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden" ref={reactFlowWrapper}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={selectedWorkflow.isBuiltIn ? undefined : onNodesChange}
                    onEdgesChange={selectedWorkflow.isBuiltIn ? undefined : onEdgesChange}
                    onConnect={selectedWorkflow.isBuiltIn ? undefined : onConnect}
                    onNodeClick={onNodeClick}
                    onDrop={selectedWorkflow.isBuiltIn ? undefined : onDrop}
                    onDragOver={selectedWorkflow.isBuiltIn ? undefined : onDragOver}
                    nodeTypes={nodeTypes}
                    fitView
                    className="bg-background"
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#334155" gap={20} size={1} />
                    <Controls />
                    <MiniMap className="bg-background/80" />
                  </ReactFlow>
                </div>
              </div>

              <div className="w-64 border-l border-border/50 flex flex-col shrink-0 overflow-hidden">
                <div className="p-3 border-b border-border/30 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedNode ? "Node Properties" : "Properties"}
                  </p>
                  {selectedNode && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => setSelectedNode(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {selectedNode ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Node Type</Label>
                        <p className="text-sm font-medium capitalize">{selectedNode.data.nodeType}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Label</Label>
                        <p className="text-sm">{selectedNode.data.label}</p>
                      </div>
                      {selectedNode.data.nodeType === "condition" && (
                        <div>
                          <Label className="text-xs">Condition Expression</Label>
                          <Textarea
                            className="mt-1 text-xs font-mono h-20"
                            placeholder={`prospect.confidenceScore > 80 AND prospect.status == "qualified"`}
                            value={(selectedNode.data.config?.expression as string) ?? ""}
                            onChange={(e) => updateNodeData("expression", e.target.value)}
                            disabled={selectedWorkflow.isBuiltIn}
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Use dot-path format. AND/OR operators supported.
                          </p>
                        </div>
                      )}
                      {selectedNode.data.nodeType === "delay" && (
                        <div>
                          <Label className="text-xs">Delay (minutes)</Label>
                          <Input
                            className="mt-1 text-xs h-8"
                            type="number"
                            min={1}
                            placeholder="60"
                            value={(selectedNode.data.config?.minutes as number) ?? ""}
                            onChange={(e) => updateNodeData("minutes", Number(e.target.value))}
                            disabled={selectedWorkflow.isBuiltIn}
                          />
                        </div>
                      )}
                      {selectedNode.data.nodeType === "trigger" && (
                        <>
                          {(selectedNode.data.subType === "schedule") && (
                            <div>
                              <Label className="text-xs">Cron Expression</Label>
                              <Input
                                className="mt-1 text-xs h-8 font-mono"
                                placeholder="0 9 * * 1-5  (weekdays at 9am)"
                                value={((selectedNode.data.config?.cron ?? selectedNode.data.config?.cronExpression) as string) ?? ""}
                                onChange={(e) => updateNodeData("cron", e.target.value)}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                              <p className="text-[10px] text-muted-foreground mt-1">Standard cron format: minute hour day month weekday</p>
                            </div>
                          )}
                          {(selectedNode.data.subType === "aeo_score_changed") && (
                            <div>
                              <Label className="text-xs">Min Score Drop (points)</Label>
                              <Input
                                className="mt-1 text-xs h-8"
                                type="number"
                                min={1}
                                placeholder="10"
                                value={(selectedNode.data.config?.minDropPoints as number) ?? ""}
                                onChange={(e) => updateNodeData("minDropPoints", Number(e.target.value))}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                              <p className="text-[10px] text-muted-foreground mt-1">Only fire when AEO score drops by at least this many points</p>
                            </div>
                          )}
                          {(selectedNode.data.subType === "prospect_qualified") && (
                            <div>
                              <Label className="text-xs">Min Confidence Score</Label>
                              <Input
                                className="mt-1 text-xs h-8"
                                type="number"
                                min={0}
                                max={100}
                                placeholder="70"
                                value={(selectedNode.data.config?.minScore as number) ?? ""}
                                onChange={(e) => updateNodeData("minScore", Number(e.target.value))}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                              <p className="text-[10px] text-muted-foreground mt-1">Only fire when prospect confidence score meets this threshold</p>
                            </div>
                          )}
                          {(selectedNode.data.subType === "webhook") && (
                            <div>
                              <Label className="text-xs">Expected Field (optional)</Label>
                              <Input
                                className="mt-1 text-xs h-8"
                                placeholder="event"
                                value={(selectedNode.data.config?.filterField as string) ?? ""}
                                onChange={(e) => updateNodeData("filterField", e.target.value)}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                              <p className="text-[10px] text-muted-foreground mt-1">Only match webhook payloads containing this field</p>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Bot ID</Label>
                            <Input
                              className="mt-1 text-xs h-8"
                              type="number"
                              placeholder="e.g. 42"
                              value={(selectedNode.data.config?.botId as number) ?? ""}
                              onChange={(e) => updateNodeData("botId", Number(e.target.value))}
                              disabled={selectedWorkflow.isBuiltIn}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Bot to act as the executor for this workflow</p>
                          </div>
                        </>
                      )}
                      {selectedNode.data.nodeType === "action" && (
                        <>
                          {(selectedNode.data.subType === "send_email") && (
                            <>
                              <div>
                                <Label className="text-xs">Recipient Email</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  placeholder="client@example.com"
                                  value={(selectedNode.data.config?.toEmail as string) ?? ""}
                                  onChange={(e) => updateNodeData("toEmail", e.target.value)}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Subject</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  placeholder="Report ready"
                                  value={(selectedNode.data.config?.subject as string) ?? ""}
                                  onChange={(e) => updateNodeData("subject", e.target.value)}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                            </>
                          )}
                          {(selectedNode.data.subType === "post_to_slack") && (
                            <div>
                              <Label className="text-xs">Slack Channel</Label>
                              <Input
                                className="mt-1 text-xs h-8"
                                placeholder="#notifications"
                                value={(selectedNode.data.config?.channel as string) ?? ""}
                                onChange={(e) => updateNodeData("channel", e.target.value)}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                            </div>
                          )}
                          {(selectedNode.data.subType === "create_hubspot_deal") && (
                            <>
                              <div>
                                <Label className="text-xs">Deal Stage</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  placeholder="appointmentscheduled"
                                  value={(selectedNode.data.config?.dealStage as string) ?? ""}
                                  onChange={(e) => updateNodeData("dealStage", e.target.value)}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Deal Amount</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  type="number"
                                  placeholder="0"
                                  value={(selectedNode.data.config?.dealAmount as number) ?? ""}
                                  onChange={(e) => updateNodeData("dealAmount", Number(e.target.value))}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                            </>
                          )}
                          {(selectedNode.data.subType === "update_prospect_status") && (
                            <div>
                              <Label className="text-xs">New Status</Label>
                              <Input
                                className="mt-1 text-xs h-8"
                                placeholder="qualified / disqualified / contacted"
                                value={(selectedNode.data.config?.newStatus as string) ?? ""}
                                onChange={(e) => updateNodeData("newStatus", e.target.value)}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                            </div>
                          )}
                          {(selectedNode.data.subType === "deploy_team") && (
                            <div>
                              <Label className="text-xs">Team / Bot Names (comma-separated)</Label>
                              <Input
                                className="mt-1 text-xs h-8"
                                placeholder="Sales Bot, Research Bot"
                                value={(selectedNode.data.config?.teamNames as string) ?? ""}
                                onChange={(e) => updateNodeData("teamNames", e.target.value)}
                                disabled={selectedWorkflow.isBuiltIn}
                              />
                            </div>
                          )}
                          {(selectedNode.data.subType === "send_notification") && (
                            <>
                              <div>
                                <Label className="text-xs">Title</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  placeholder="Notification title"
                                  value={(selectedNode.data.config?.title as string) ?? ""}
                                  onChange={(e) => updateNodeData("title", e.target.value)}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Severity</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  placeholder="info / warning / critical"
                                  value={(selectedNode.data.config?.severity as string) ?? ""}
                                  onChange={(e) => updateNodeData("severity", e.target.value)}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                            </>
                          )}
                          {(selectedNode.data.subType === "create_calendar_event") && (
                            <>
                              <div>
                                <Label className="text-xs">Event Title</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  placeholder="Follow-up call"
                                  value={(selectedNode.data.config?.eventTitle as string) ?? ""}
                                  onChange={(e) => updateNodeData("eventTitle", e.target.value)}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Duration (minutes)</Label>
                                <Input
                                  className="mt-1 text-xs h-8"
                                  type="number"
                                  placeholder="30"
                                  value={(selectedNode.data.config?.durationMinutes as number) ?? ""}
                                  onChange={(e) => updateNodeData("durationMinutes", Number(e.target.value))}
                                  disabled={selectedWorkflow.isBuiltIn}
                                />
                              </div>
                            </>
                          )}
                          <div>
                            <Label className="text-xs">Bot / Target</Label>
                            <Input
                              className="mt-1 text-xs h-8"
                              placeholder="e.g. Sales Bot"
                              value={(selectedNode.data.config?.botName as string) ?? ""}
                              onChange={(e) => updateNodeData("botName", e.target.value)}
                              disabled={selectedWorkflow.isBuiltIn}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Notes</Label>
                            <Textarea
                              className="mt-1 text-xs h-16"
                              placeholder="Additional notes for this node"
                              value={(selectedNode.data.config?.notes as string) ?? ""}
                              onChange={(e) => updateNodeData("notes", e.target.value)}
                              disabled={selectedWorkflow.isBuiltIn}
                            />
                          </div>
                        </>
                      )}
                      {!selectedWorkflow.isBuiltIn && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                          onClick={deleteSelectedNode}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remove Node
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Trigger</Label>
                        <p className="text-sm font-medium">{selectedWorkflow.triggerType}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <div className="flex items-center gap-2 mt-1">
                          {selectedWorkflow.enabled ? (
                            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Run Count</Label>
                        <p className="text-sm">{selectedWorkflow.runCount}</p>
                      </div>
                      {selectedWorkflow.lastRunAt && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Last Run</Label>
                          <p className="text-sm">{formatDistanceToNow(new Date(selectedWorkflow.lastRunAt), { addSuffix: true })}</p>
                        </div>
                      )}
                      {selectedWorkflow.nodes.length === 0 && !selectedWorkflow.isBuiltIn && (
                        <div className="p-3 rounded-lg border border-dashed border-border/50 text-center">
                          <p className="text-xs text-muted-foreground">Drag nodes from the library to start building</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Workflow className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm font-medium mb-1">Select a workflow to edit</p>
                <p className="text-xs">Or create a new workflow to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewWorkflow && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">New Workflow</CardTitle>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowNewWorkflow(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Prospect-to-Outreach"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  className="mt-1"
                  placeholder="Describe what this workflow does"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <div>
                <Label>Trigger Type</Label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newTriggerType}
                  onChange={(e) => setNewTriggerType(e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="webhook">Webhook</option>
                  <option value="prospect_qualified">Prospect Qualified</option>
                  <option value="aeo_score_changed">AEO Score Changed</option>
                  <option value="schedule">Schedule (Cron)</option>
                  <option value="new_client_created">New Client Created</option>
                  <option value="approval_completed">Approval Completed</option>
                  <option value="email_received">Email Received</option>
                  <option value="twilio_call_ended">Twilio Call Ended</option>
                  <option value="competitor_citation_gained">Competitor Citation Gained</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!newName.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate({
                    name: newName.trim(),
                    description: newDesc.trim() || undefined,
                    triggerType: newTriggerType,
                    nodes: [],
                    edges: [],
                    enabled: false,
                  })}
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Workflow"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}

export default function ProcessStudio() {
  return (
    <ReactFlowProvider>
      <ProcessStudioInner />
    </ReactFlowProvider>
  );
}
