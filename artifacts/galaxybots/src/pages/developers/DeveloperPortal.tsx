import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import {
  Key,
  Code2,
  Webhook,
  BookOpen,
  Activity,
  History,
  Copy,
  Check,
  Trash2,
  Loader2,
  Play,
  Send,
  Terminal,
  Shield,
  Zap,
  Globe,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  LogIn,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DevKey {
  id: number;
  label: string;
  keyPrefix: string;
  scopes: string[];
  tier: string;
  rateLimit: number;
  status: string;
  totalCalls: number;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface WebhookEvent {
  eventType: string;
  description: string;
  payload: object;
}

interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  description: string;
  breaking: boolean;
  changes: string[];
  publishedAt: string;
}

interface UsageData {
  keyId: number;
  label: string;
  totalCalls: number;
  rateLimit: number;
  rateLimitRemaining: number;
  lastUsedAt: string | null;
  usageByEndpoint: {
    endpoint: string;
    method: string;
    callCount: number;
    avgLatencyMs: number;
    errorCount: number;
    totalTokens: number;
  }[];
  usageOverTime: {
    date: string;
    callCount: number;
    errorCount: number;
    totalTokens: number;
  }[];
}

function LoginGate({ children, message }: { children: React.ReactNode; message: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-8 text-center space-y-4">
          <LogIn className="w-10 h-10 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-display font-bold text-lg mb-1">Sign in Required</h3>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Button onClick={() => navigate("/login")}>
            <LogIn className="w-4 h-4 mr-2" /> Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

function OverviewSection() {
  return (
    <div className="space-y-6">
      <div className="text-center max-w-3xl mx-auto mb-8">
        <h2 className="text-3xl font-display font-bold mb-3">Build on GalaxyBots</h2>
        <p className="text-muted-foreground">
          Integrate AI-powered bots, task automation, and intelligent pipelines into your applications.
          The GalaxyBots API gives you programmatic access to the full platform.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
              <Code2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-display font-bold mb-1">REST API</h3>
            <p className="text-xs text-muted-foreground">
              Full CRUD for bots, conversations, task sessions, pipelines, and more
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-cyan/5 to-transparent">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center mx-auto mb-3">
              <Webhook className="w-6 h-6 text-cyan" />
            </div>
            <h3 className="font-display font-bold mb-1">Webhooks</h3>
            <p className="text-xs text-muted-foreground">
              Real-time event notifications for task completions, leads, and alerts
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-gold/5 to-transparent">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-3">
              <Terminal className="w-6 h-6 text-gold" />
            </div>
            <h3 className="font-display font-bold mb-1">MCP Server</h3>
            <p className="text-xs text-muted-foreground">
              Connect Claude, Cursor, or any MCP client to GalaxyBots tools
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-bold">1. Generate an API Key</p>
            <p className="text-xs text-muted-foreground">Go to the "My Keys" tab and create a new developer API key with your desired scopes.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">2. Make Your First Request</p>
            <CodeBlock code={`curl -H "Authorization: Bearer gbdev_your_key_here" \\
  ${window.location.origin}/api/healthz`} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-bold">3. Explore the API</p>
            <p className="text-xs text-muted-foreground">Browse the API Reference tab for all available endpoints, or try the Playground to test live requests.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All API requests must include your API key in the Authorization header:
          </p>
          <CodeBlock code={`Authorization: Bearer gbdev_your_api_key_here`} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold">Read Scope</span>
              </div>
              <p className="text-[10px] text-muted-foreground">GET requests to all endpoints</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-gold" />
                <span className="text-xs font-bold">Write Scope</span>
              </div>
              <p className="text-[10px] text-muted-foreground">POST/PATCH/DELETE + read access</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-cyan" />
                <span className="text-xs font-bold">Admin Scope</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Full access including client management</p>
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-primary font-bold mb-1">Rate Limits</p>
            <p className="text-xs text-muted-foreground">
              Standard keys: 1,000 requests/day. Partner keys: 5,000 requests/day.
              Rate limit status is available in response headers and the Usage tab.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-secondary/80 border border-border/50 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copyCode}
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </Button>
    </div>
  );
}

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newScopes, setNewScopes] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          label: newLabel || "default",
          scopes: newScopes.split(",").map(s => s.trim()),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.apiKey);
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/developer/keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
    },
  });

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <LoginGate message="Sign in to generate and manage your developer API keys.">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold">API Keys</h2>
          <Badge variant="outline" className="font-tech text-xs">
            {keys?.filter(k => k.status === "active").length ?? 0} active
          </Badge>
        </div>

        {createdKey && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-primary">New API Key Created — copy it now, it won't be shown again</p>
              <div className="flex gap-2">
                <Input value={createdKey} readOnly className="text-xs font-mono" />
                <Button size="sm" variant="outline" onClick={copyKey}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key label (e.g. production-app)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="text-xs flex-1"
              />
              <Select value={newScopes} onValueChange={setNewScopes}>
                <SelectTrigger className="w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="read,write">Read + Write</SelectItem>
                  <SelectItem value="read,write,admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => createKey.mutate()} disabled={createKey.isPending}>
                {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4 mr-1" />}
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys && keys.length > 0 ? (
          <div className="space-y-2">
            {keys.map((k) => (
              <Card key={k.id} className={`border-border/50 ${k.status === "revoked" ? "opacity-50" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{k.label}</span>
                        <Badge variant={k.status === "active" ? "default" : "destructive"} className="text-[10px]">
                          {k.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {k.tier}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{k.keyPrefix}...</span>
                        <span>Scopes: {k.scopes.join(", ")}</span>
                        <span>Calls: {k.totalCalls.toLocaleString()}</span>
                        <span>Limit: {k.rateLimit.toLocaleString()}/day</span>
                      </div>
                    </div>
                    {k.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => revokeKey.mutate(k.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No API keys yet. Create one to get started.
          </div>
        )}
      </div>
    </LoginGate>
  );
}

interface ParsedEndpoint {
  path: string;
  methods: {
    method: string;
    summary: string;
    operationId: string;
    tags: string[];
    parameters: string[];
    requestBodyExample: string | null;
    responses: { status: string; description: string }[];
  }[];
}

function parseOpenApiSpec(spec: string): ParsedEndpoint[] {
  const paths: ParsedEndpoint[] = [];
  const lines = spec.split("\n");
  let currentPath = "";
  let currentEntry: ParsedEndpoint["methods"][0] | null = null;
  let inParameters = false;
  let inRequestBody = false;
  let inResponses = false;
  let currentResponseStatus = "";

  for (const line of lines) {
    const pathMatch = line.match(/^  (\/\S+):$/);
    if (pathMatch) {
      if (currentPath && currentEntry) {
        const existing = paths.find(p => p.path === currentPath);
        if (existing) existing.methods.push(currentEntry);
        else paths.push({ path: currentPath, methods: [currentEntry] });
      }
      currentPath = pathMatch[1];
      currentEntry = null;
      inParameters = false;
      inRequestBody = false;
      inResponses = false;
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (methodMatch && currentPath) {
      if (currentEntry) {
        const existing = paths.find(p => p.path === currentPath);
        if (existing) existing.methods.push(currentEntry);
        else paths.push({ path: currentPath, methods: [currentEntry] });
      }
      currentEntry = {
        method: methodMatch[1].toUpperCase(),
        summary: "",
        operationId: "",
        tags: [],
        parameters: [],
        requestBodyExample: null,
        responses: [],
      };
      inParameters = false;
      inRequestBody = false;
      inResponses = false;
      continue;
    }

    if (currentEntry) {
      const summaryMatch = line.match(/^\s+summary:\s*(.+)$/);
      if (summaryMatch) { currentEntry.summary = summaryMatch[1]; continue; }
      const opMatch = line.match(/^\s+operationId:\s*(.+)$/);
      if (opMatch) { currentEntry.operationId = opMatch[1]; continue; }
      const tagMatch = line.match(/^\s+tags:\s*\[(.+)\]$/);
      if (tagMatch) { currentEntry.tags = tagMatch[1].split(",").map((t: string) => t.trim()); continue; }

      if (line.match(/^\s+parameters:$/)) { inParameters = true; inRequestBody = false; inResponses = false; continue; }
      if (line.match(/^\s+requestBody:$/)) { inRequestBody = true; inParameters = false; inResponses = false; continue; }
      if (line.match(/^\s+responses:$/)) { inResponses = true; inParameters = false; inRequestBody = false; continue; }

      if (inParameters) {
        const nameMatch = line.match(/^\s+name:\s*(.+)$/);
        if (nameMatch) currentEntry.parameters.push(nameMatch[1]);
      }

      if (inResponses) {
        const statusMatch = line.match(/^\s+'(\d+)':$/);
        if (statusMatch) { currentResponseStatus = statusMatch[1]; continue; }
        const descMatch = line.match(/^\s+description:\s*(.+)$/);
        if (descMatch && currentResponseStatus) {
          currentEntry.responses.push({ status: currentResponseStatus, description: descMatch[1] });
          currentResponseStatus = "";
        }
      }
    }
  }

  if (currentPath && currentEntry) {
    const existing = paths.find(p => p.path === currentPath);
    if (existing) existing.methods.push(currentEntry);
    else paths.push({ path: currentPath, methods: [currentEntry] });
  }

  return paths;
}

function ApiReferenceSection() {
  const { data: spec, isLoading } = useQuery<string>({
    queryKey: ["developer", "openapi"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/openapi`);
      if (!res.ok) throw new Error("Failed");
      return res.text();
    },
  });

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());

  const togglePath = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const parsed = parseOpenApiSpec(spec || "");

  const methodColor: Record<string, string> = {
    GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    PATCH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const tagGroups: Record<string, { path: string; method: ParsedEndpoint["methods"][0] }[]> = {};
  for (const p of parsed) {
    for (const m of p.methods) {
      const tag = m.tags[0] || "other";
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push({ path: p.path, method: m });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">API Reference</h2>
        <div className="flex items-center gap-2">
          <a
            href={`${BASE}/api/developer/openapi`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Download OpenAPI Spec
          </a>
          <Badge variant="outline" className="font-tech text-xs">
            OpenAPI 3.1
          </Badge>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Full REST API documentation auto-generated from the OpenAPI specification.
        Base URL: <code className="text-xs bg-secondary/80 px-1 py-0.5 rounded">{window.location.origin}/api</code>
      </p>

      {parsed.length > 0 ? (
        <div className="space-y-3">
          {Object.entries(tagGroups).map(([tag, endpoints]) => (
            <Card key={tag} className="border-border/50">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => togglePath(tag)}>
                <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  {expandedPaths.has(tag) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {tag}
                  <Badge variant="outline" className="text-[10px] ml-auto">{endpoints.length}</Badge>
                </CardTitle>
              </CardHeader>
              {expandedPaths.has(tag) && (
                <CardContent className="pt-0 space-y-1">
                  {endpoints.map((ep, idx) => {
                    const epKey = `${tag}-${idx}`;
                    const isExpanded = expandedEndpoints.has(epKey);
                    return (
                      <div key={idx} className="border border-border/30 rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-3 p-2 hover:bg-secondary/50 transition-colors cursor-pointer"
                          onClick={() => toggleEndpoint(epKey)}
                        >
                          <Badge className={`text-[10px] font-mono w-16 justify-center ${methodColor[ep.method.method] || ""}`}>
                            {ep.method.method}
                          </Badge>
                          <code className="text-xs font-mono text-muted-foreground flex-1">{ep.path}</code>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{ep.method.summary}</span>
                          {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border/30 p-3 bg-secondary/20 space-y-3">
                            {ep.method.operationId && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Operation ID: </span>
                                <code className="font-mono text-primary">{ep.method.operationId}</code>
                              </div>
                            )}
                            {ep.method.parameters.length > 0 && (
                              <div>
                                <p className="text-xs font-bold mb-1">Parameters</p>
                                <div className="space-y-1">
                                  {ep.method.parameters.map((param, pi) => (
                                    <div key={pi} className="flex items-center gap-2 text-xs">
                                      <code className="font-mono bg-secondary/80 px-1.5 py-0.5 rounded">{param}</code>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold mb-1">Example Request</p>
                              <CodeBlock code={`curl -X ${ep.method.method} "${window.location.origin}/api${ep.path}" \\
  -H "Authorization: Bearer gbdev_your_key_here" \\
  -H "Content-Type: application/json"${ep.method.method !== "GET" && ep.method.method !== "DELETE" ? ` \\
  -d '{}'` : ""}`} />
                            </div>
                            {ep.method.responses.length > 0 && (
                              <div>
                                <p className="text-xs font-bold mb-1">Responses</p>
                                <div className="space-y-1">
                                  {ep.method.responses.map((resp, ri) => (
                                    <div key={ri} className="flex items-center gap-2 text-xs">
                                      <Badge variant={resp.status.startsWith("2") ? "default" : resp.status.startsWith("4") ? "destructive" : "outline"} className="text-[10px]">
                                        {resp.status}
                                      </Badge>
                                      <span className="text-muted-foreground">{resp.description}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Unable to parse OpenAPI spec. Raw specification available at <code className="text-xs">/api/developer/openapi</code></p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlaygroundSection() {
  const { user } = useAuth();
  const [method, setMethod] = useState("GET");
  const [endpoint, setEndpoint] = useState("/healthz");
  const [body, setBody] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authMode, setAuthMode] = useState<"key" | "session">("key");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const { data: keys } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const activeKeys = keys?.filter(k => k.status === "active") || [];

  const commonEndpoints = [
    { method: "GET", path: "/healthz", label: "Health Check" },
    { method: "GET", path: "/bots", label: "List Bots" },
    { method: "GET", path: "/clients", label: "List Clients" },
    { method: "GET", path: "/conversations", label: "List Conversations" },
    { method: "GET", path: "/task-sessions", label: "List Task Sessions" },
    { method: "GET", path: "/analytics/overview", label: "Analytics Overview" },
    { method: "GET", path: "/developer/changelog", label: "API Changelog" },
  ];

  const fireRequest = async () => {
    setLoading(true);
    setResponse(null);
    setStatus(null);
    setLatency(null);

    const start = Date.now();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authMode === "key" && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const opts: RequestInit = {
        method,
        headers,
      };

      if (authMode === "session") {
        opts.credentials = "include";
      }

      if (method !== "GET" && method !== "HEAD" && body) {
        opts.body = body;
      }
      const res = await fetch(`${BASE}/api${endpoint}`, opts);
      const elapsed = Date.now() - start;
      setLatency(elapsed);
      setStatus(res.status);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err) {
      setLatency(Date.now() - start);
      setResponse(err instanceof Error ? err.message : "Request failed");
      setStatus(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginGate message="Sign in to use the API playground and test endpoints with your API key.">
      <div className="space-y-4">
        <h2 className="text-xl font-display font-bold">API Playground</h2>
        <p className="text-sm text-muted-foreground">
          Test API endpoints directly in your browser. Use your developer API key for authentication.
        </p>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={authMode === "key" ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setAuthMode("key")}
              >
                <Key className="w-3 h-3 mr-1" /> API Key
              </Button>
              <Button
                variant={authMode === "session" ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setAuthMode("session")}
              >
                <Shield className="w-3 h-3 mr-1" /> Session
              </Button>
            </div>
            {authMode === "key" && (
              <div className="space-y-2">
                <Input
                  placeholder="Paste your gbdev_... API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="text-xs font-mono"
                  type="password"
                />
                {activeKeys.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    You have {activeKeys.length} active key{activeKeys.length > 1 ? "s" : ""}: {activeKeys.map(k => k.keyPrefix + "...").join(", ")}
                  </p>
                )}
              </div>
            )}
            {authMode === "session" && (
              <p className="text-xs text-muted-foreground">Using your current browser session for authentication.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 mb-4">
          {commonEndpoints.map((ep) => (
            <Button
              key={ep.path}
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => { setMethod(ep.method); setEndpoint(ep.path); setBody(""); }}
            >
              <span className="text-primary font-mono mr-1">{ep.method}</span>
              {ep.label}
            </Button>
          ))}
        </div>

        <Card className="border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-24 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1 flex items-center bg-secondary/50 rounded-md border border-border/50 px-3">
                <span className="text-xs text-muted-foreground font-mono">/api</span>
                <Input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="border-0 bg-transparent text-xs font-mono shadow-none focus-visible:ring-0 pl-0"
                  placeholder="/endpoint"
                />
              </div>
              <Button onClick={fireRequest} disabled={loading} size="sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                Send
              </Button>
            </div>

            {method !== "GET" && method !== "HEAD" && (
              <div>
                <Label className="text-xs text-muted-foreground">Request Body (JSON)</Label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full h-24 mt-1 p-2 text-xs font-mono bg-secondary/50 border border-border/50 rounded-md resize-none"
                  placeholder='{ "key": "value" }'
                />
              </div>
            )}

            {response !== null && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant={status && status < 400 ? "default" : "destructive"}>
                    {status}
                  </Badge>
                  {latency !== null && (
                    <span className="text-muted-foreground">{latency}ms</span>
                  )}
                </div>
                <pre className="bg-secondary/80 border border-border/50 rounded-lg p-3 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                  {response}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LoginGate>
  );
}

function WebhooksSection() {
  const { user } = useAuth();
  const [testUrl, setTestUrl] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("task_session.completed");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const { data: events } = useQuery<WebhookEvent[]>({
    queryKey: ["developer", "webhook-events"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/webhook-events`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/developer/webhook-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: testUrl, eventType: selectedEvent }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => setTestResult(data),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">Webhook Events</h2>
      <p className="text-sm text-muted-foreground">
        GalaxyBots fires outbound webhook events when key actions occur. Register a URL to receive notifications in real time.
      </p>

      <div className="space-y-2">
        {events?.map((ev) => (
          <Card key={ev.eventType} className="border-border/50">
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedEvent(expandedEvent === ev.eventType ? null : ev.eventType)}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">{ev.eventType}</Badge>
                  <span className="text-xs text-muted-foreground">{ev.description}</span>
                </div>
                {expandedEvent === ev.eventType ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
              {expandedEvent === ev.eventType && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground mb-1 block">Sample Payload</Label>
                  <pre className="bg-secondary/80 border border-border/50 rounded-lg p-3 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {user ? (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Send className="w-4 h-4" />
              Test Webhook Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Fire a sample webhook payload to your endpoint to test your integration.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="https://your-server.com/webhook"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="text-xs flex-1"
              />
              <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                <SelectTrigger className="w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task_session.completed">task_session.completed</SelectItem>
                  <SelectItem value="pipeline.triggered">pipeline.triggered</SelectItem>
                  <SelectItem value="bot.alert">bot.alert</SelectItem>
                  <SelectItem value="lead.received">lead.received</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !testUrl}
              >
                {sendTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Send Test
              </Button>
            </div>

            {testResult && (
              <div className={`rounded-lg border p-3 ${testResult.success ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs font-bold">
                    {testResult.success ? `Delivered — ${testResult.statusCode} ${testResult.statusText}` : `Failed — ${testResult.error}`}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Sign in to test webhook delivery to your endpoints.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function McpGuideSection() {
  const { user } = useAuth();
  const mcpUrl = `${window.location.origin}/__mcp/sse`;

  const { data: keys } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const activeKey = keys?.find(k => k.status === "active");
  const keyPlaceholder = activeKey ? `${activeKey.keyPrefix}... (use your full key)` : "YOUR_API_KEY";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">MCP Connection Guide</h2>
      <p className="text-sm text-muted-foreground">
        The Model Context Protocol (MCP) lets AI assistants use GalaxyBots tools directly.
        Connect Claude Desktop, Cursor, Windsurf, or any MCP-compatible client.
      </p>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
            Your MCP Server
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">SSE Endpoint:</Label>
            <code className="text-xs font-mono bg-secondary/80 px-2 py-1 rounded">{mcpUrl}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Authentication: Pass your developer API key (<code className="bg-secondary/80 px-1 py-0.5 rounded">gbdev_...</code>) as a Bearer token in the connection.
            {!user && " Sign in and create a key in the My Keys tab to get started."}
          </p>
          {activeKey && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-primary font-bold mb-1">Your Active Key</p>
              <p className="text-xs text-muted-foreground font-mono">
                {activeKey.keyPrefix}... ({activeKey.label}) — use the full key from the My Keys tab
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Claude Desktop
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Add this to your <code className="bg-secondary/80 px-1 py-0.5 rounded">claude_desktop_config.json</code>:
          </p>
          <CodeBlock language="json" code={JSON.stringify({
            mcpServers: {
              galaxybots: {
                transport: "sse",
                url: mcpUrl,
                headers: {
                  Authorization: `Bearer ${keyPlaceholder}`
                }
              }
            }
          }, null, 2)} />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Cursor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Add this to your <code className="bg-secondary/80 px-1 py-0.5 rounded">.cursor/mcp.json</code>:
          </p>
          <CodeBlock language="json" code={JSON.stringify({
            mcpServers: {
              galaxybots: {
                url: mcpUrl,
                headers: {
                  Authorization: `Bearer ${keyPlaceholder}`
                }
              }
            }
          }, null, 2)} />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Windsurf / Other MCP Clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            For any SSE-compatible MCP client, use these connection details:
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-24">Transport:</span>
              <code className="font-mono bg-secondary/80 px-2 py-1 rounded">SSE</code>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-24">URL:</span>
              <code className="font-mono bg-secondary/80 px-2 py-1 rounded">{mcpUrl}</code>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-24">Auth Header:</span>
              <code className="font-mono bg-secondary/80 px-2 py-1 rounded">Bearer {keyPlaceholder}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5 border">
        <CardContent className="p-4">
          <h3 className="text-sm font-bold mb-2">Available MCP Tools</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {[
              { name: "list_bots", desc: "List all available AI bots" },
              { name: "get_bot", desc: "Get details of a specific bot" },
              { name: "create_task_session", desc: "Deploy a bot team on a mission" },
              { name: "list_task_sessions", desc: "View active task sessions" },
              { name: "memory_search", desc: "Search bot memories semantically" },
              { name: "send_email", desc: "Send emails through bot actions" },
              { name: "web_search", desc: "Search the web for information" },
              { name: "http_fetch", desc: "Fetch data from external URLs" },
            ].map((tool) => (
              <div key={tool.name} className="flex items-center gap-2 p-2 rounded bg-secondary/30">
                <Terminal className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="font-mono font-bold">{tool.name}</span>
                <span className="text-muted-foreground ml-auto truncate">{tool.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageSection() {
  const { data: keys } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const activeKeys = keys?.filter(k => k.status === "active") || [];

  const effectiveKeyId = selectedKeyId ?? activeKeys[0]?.id ?? null;

  const { data: usage, isLoading } = useQuery<UsageData>({
    queryKey: ["developer", "usage", effectiveKeyId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys/${effectiveKeyId}/usage`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!effectiveKeyId,
  });

  return (
    <LoginGate message="Sign in to view your API key usage metrics and analytics.">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold">API Usage</h2>
          {activeKeys.length > 0 && (
            <Select
              value={String(effectiveKeyId ?? "")}
              onValueChange={(v) => setSelectedKeyId(Number(v))}
            >
              <SelectTrigger className="w-48 text-xs">
                <SelectValue placeholder="Select key" />
              </SelectTrigger>
              <SelectContent>
                {activeKeys.map((k) => (
                  <SelectItem key={k.id} value={String(k.id)}>
                    {k.label} ({k.keyPrefix}...)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!effectiveKeyId ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Create an API key first to view usage metrics.
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : usage ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Total Calls</p>
                  <p className="text-2xl font-display font-bold">{usage.totalCalls.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Rate Limit</p>
                  <p className="text-2xl font-display font-bold">{usage.rateLimit.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Remaining</p>
                  <p className="text-2xl font-display font-bold">{usage.rateLimitRemaining.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-tech uppercase">Last Used</p>
                  <p className="text-sm font-display font-bold">
                    {usage.lastUsedAt ? new Date(usage.lastUsedAt).toLocaleDateString() : "Never"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {usage.usageByEndpoint.length > 0 && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                    Usage by Endpoint (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="grid grid-cols-6 gap-2 text-[10px] font-tech text-muted-foreground uppercase px-2 pb-1 border-b border-border/30">
                      <span className="col-span-2">Endpoint</span>
                      <span className="text-right">Calls</span>
                      <span className="text-right">Errors</span>
                      <span className="text-right">Avg Latency</span>
                      <span className="text-right">Tokens</span>
                    </div>
                    {usage.usageByEndpoint.map((u, i) => (
                      <div key={i} className="grid grid-cols-6 gap-2 text-xs px-2 py-1.5 rounded hover:bg-secondary/50">
                        <span className="col-span-2 font-mono truncate">
                          <Badge variant="outline" className="text-[10px] mr-1">{u.method}</Badge>
                          {u.endpoint}
                        </span>
                        <span className="text-right">{u.callCount}</span>
                        <span className={`text-right ${u.errorCount > 0 ? "text-red-400" : ""}`}>{u.errorCount}</span>
                        <span className="text-right">{u.avgLatencyMs}ms</span>
                        <span className="text-right">{u.totalTokens.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {usage.usageOverTime.length > 0 && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">
                    Daily API Calls (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {usage.usageOverTime.map((d) => (
                      <div key={d.date} className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground font-mono w-24">{d.date}</span>
                        <div className="flex-1 h-4 bg-secondary/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{
                              width: `${Math.min(100, (d.callCount / Math.max(...usage.usageOverTime.map(x => x.callCount))) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="w-12 text-right">{d.callCount}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {usage.usageByEndpoint.length === 0 && usage.usageOverTime.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No usage data yet. Start making API calls to see metrics here.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </LoginGate>
  );
}

function ChangelogSection() {
  const { data: entries, isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["developer", "changelog"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/changelog`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">API Changelog</h2>
      <p className="text-sm text-muted-foreground">
        Track API changes, new features, and breaking changes across versions.
      </p>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border/50" />
        <div className="space-y-6">
          {entries?.map((entry) => (
            <div key={entry.id} className="relative pl-10">
              <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-primary bg-background" />
              <Card className="border-border/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{entry.version}</Badge>
                    {entry.breaking && (
                      <Badge variant="destructive" className="text-[10px]">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Breaking
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(entry.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-sm">{entry.title}</h3>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                  {entry.changes && entry.changes.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {entry.changes.map((change, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {(!entries || entries.length === 0) && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No changelog entries yet.
        </div>
      )}
    </div>
  );
}

export default function DeveloperPortal() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
              <Code2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold">Developer Portal</h1>
              <p className="text-sm text-muted-foreground">APIs, webhooks, and tools to build on GalaxyBots</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-secondary/50">
            <TabsTrigger value="overview" className="text-xs gap-1">
              <BookOpen className="w-3 h-3" /> Overview
            </TabsTrigger>
            <TabsTrigger value="keys" className="text-xs gap-1">
              <Key className="w-3 h-3" /> My Keys
            </TabsTrigger>
            <TabsTrigger value="reference" className="text-xs gap-1">
              <Code2 className="w-3 h-3" /> API Reference
            </TabsTrigger>
            <TabsTrigger value="playground" className="text-xs gap-1">
              <Play className="w-3 h-3" /> Playground
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs gap-1">
              <Webhook className="w-3 h-3" /> Webhooks
            </TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs gap-1">
              <Terminal className="w-3 h-3" /> MCP Guide
            </TabsTrigger>
            <TabsTrigger value="usage" className="text-xs gap-1">
              <Activity className="w-3 h-3" /> Usage
            </TabsTrigger>
            <TabsTrigger value="changelog" className="text-xs gap-1">
              <History className="w-3 h-3" /> Changelog
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewSection /></TabsContent>
          <TabsContent value="keys"><ApiKeysSection /></TabsContent>
          <TabsContent value="reference"><ApiReferenceSection /></TabsContent>
          <TabsContent value="playground"><PlaygroundSection /></TabsContent>
          <TabsContent value="webhooks"><WebhooksSection /></TabsContent>
          <TabsContent value="mcp"><McpGuideSection /></TabsContent>
          <TabsContent value="usage"><UsageSection /></TabsContent>
          <TabsContent value="changelog"><ChangelogSection /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
