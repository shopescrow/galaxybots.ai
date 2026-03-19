import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Server, Plus, ExternalLink, Copy, Check, Loader2,
  Zap, BarChart2, Globe, Edit2, Trash2, Sparkles, Radio,
  TrendingUp, Activity, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface McpServer {
  id: number;
  clientId: number | null;
  clientName: string | null;
  name: string;
  description: string | null;
  sseUrl: string | null;
  authType: string;
  tags: string[];
  isOwn: boolean;
  createdAt: string;
}

interface Directory {
  slug: string;
  name: string;
  url: string;
  submitUrl: string;
  description: string;
  category: string;
  submission: {
    id: number;
    status: string;
    listingUrl: string | null;
    optimizedDescription: string | null;
    notes: string | null;
    submittedAt: string | null;
  } | null;
}

interface Analytics {
  totalCalls: number;
  successCalls: number;
  topTools: { toolName: string; calls: number }[];
  dailyCalls: { day: string; calls: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  submitted: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  live: "bg-green-500/15 text-green-500 border-green-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  pending: "In Progress",
  submitted: "Submitted",
  live: "Live",
};

const CHANNELS = [
  { id: "reddit", label: "Reddit", icon: "R", sub: "r/mcp, r/AI_Agents, r/ClaudeAI" },
  { id: "twitter", label: "X / Twitter", icon: "𝕏", sub: "#MCP #AIagents" },
  { id: "hackernews", label: "Hacker News", icon: "▲", sub: "Show HN format" },
  { id: "discord", label: "Discord", icon: "D", sub: "Anthropic, Cursor, LangChain" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="sm" onClick={copy} className="gap-1 h-7">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function McpGrowthHub() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [showServerForm, setShowServerForm] = useState(false);
  const [editServer, setEditServer] = useState<McpServer | null>(null);
  const [generatingListingSlug, setGeneratingListingSlug] = useState<string | null>(null);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState("reddit");
  const [generatedContent, setGeneratedContent] = useState<string>("");
  const [expandedDirectory, setExpandedDirectory] = useState<string | null>(null);
  const [serverForm, setServerForm] = useState({ name: "", description: "", sseUrl: "", authType: "api_key", tags: "", isOwn: false, clientId: "" });

  const { data: servers = [], isLoading: serversLoading } = useQuery<McpServer[]>({
    queryKey: ["mcp-servers"],
    queryFn: () => fetch(`${BASE}/api/mcp-marketing/servers`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: directories = [], isLoading: dirLoading } = useQuery<Directory[]>({
    queryKey: ["mcp-directories", selectedServerId],
    queryFn: () => fetch(`${BASE}/api/mcp-marketing/servers/${selectedServerId}/directories`, { credentials: "include" }).then(r => r.json()),
    enabled: selectedServerId !== null,
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["mcp-analytics"],
    queryFn: () => fetch(`${BASE}/api/mcp-marketing/analytics`, { credentials: "include" }).then(r => r.json()),
  });

  const createServer = useMutation({
    mutationFn: (data: object) => fetch(`${BASE}/api/mcp-marketing/servers`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp-servers"] }); setShowServerForm(false); toast({ title: "Server registered" }); },
    onError: () => toast({ title: "Failed to register server", variant: "destructive" }),
  });

  const updateServer = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => fetch(`${BASE}/api/mcp-marketing/servers/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp-servers"] }); setEditServer(null); toast({ title: "Server updated" }); },
    onError: () => toast({ title: "Failed to update server", variant: "destructive" }),
  });

  const deleteServer = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/mcp-marketing/servers/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp-servers"] }); if (selectedServerId !== null) setSelectedServerId(null); toast({ title: "Server removed" }); },
  });

  const updateDirectory = useMutation({
    mutationFn: ({ serverId, slug, data }: { serverId: number; slug: string; data: object }) =>
      fetch(`${BASE}/api/mcp-marketing/servers/${serverId}/directories/${slug}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-directories", selectedServerId] }),
    onError: () => toast({ title: "Failed to update directory", variant: "destructive" }),
  });

  const generateListing = async (slug: string) => {
    if (!selectedServerId) return;
    setGeneratingListingSlug(slug);
    try {
      const r = await fetch(`${BASE}/api/mcp-marketing/servers/${selectedServerId}/generate-listing`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directorySlug: slug }),
      });
      const data = await r.json();
      await updateDirectory.mutateAsync({ serverId: selectedServerId, slug, data: { optimizedDescription: data.description } });
      toast({ title: "Listing generated" });
    } catch {
      toast({ title: "Failed to generate listing", variant: "destructive" });
    } finally {
      setGeneratingListingSlug(null);
    }
  };

  const generateContent = async () => {
    if (!selectedServerId) return;
    setGeneratingContent(true);
    setGeneratedContent("");
    try {
      const r = await fetch(`${BASE}/api/mcp-marketing/servers/${selectedServerId}/generate-content`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: selectedChannel }),
      });
      const data = await r.json();
      setGeneratedContent(data.content ?? "");
    } catch {
      toast({ title: "Failed to generate content", variant: "destructive" });
    } finally {
      setGeneratingContent(false);
    }
  };

  const submitServerForm = () => {
    const payload = {
      name: serverForm.name,
      description: serverForm.description || null,
      sseUrl: serverForm.sseUrl || null,
      authType: serverForm.authType,
      tags: serverForm.tags ? serverForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      isOwn: serverForm.isOwn,
      clientId: serverForm.clientId ? Number(serverForm.clientId) : null,
    };
    if (editServer) {
      updateServer.mutate({ id: editServer.id, data: payload });
    } else {
      createServer.mutate(payload);
    }
  };

  const openEditServer = (s: McpServer) => {
    setEditServer(s);
    setServerForm({
      name: s.name, description: s.description ?? "", sseUrl: s.sseUrl ?? "",
      authType: s.authType, tags: (s.tags ?? []).join(", "),
      isOwn: s.isOwn, clientId: s.clientId?.toString() ?? "",
    });
    setShowServerForm(true);
  };

  const liveCount = directories.filter(d => d.submission?.status === "live").length;
  const successRate = analytics && analytics.totalCalls > 0
    ? Math.round((Number(analytics.successCalls) / Number(analytics.totalCalls)) * 100)
    : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="h-6 w-6 text-primary" />
              MCP Growth Hub
            </h1>
            <p className="text-muted-foreground mt-1">
              Market your MCP servers across every major agent discovery platform
            </p>
          </div>
          <Button onClick={() => { setEditServer(null); setServerForm({ name: "", description: "", sseUrl: "", authType: "api_key", tags: "", isOwn: false, clientId: "" }); setShowServerForm(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Register MCP Server
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{servers.length}</div>
              <div className="text-sm text-muted-foreground">Servers Tracked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-500">{liveCount}</div>
              <div className="text-sm text-muted-foreground">Live Listings</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{Number(analytics?.totalCalls ?? 0).toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">MCP Calls (30d)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-primary">{successRate}%</div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="servers">
          <TabsList>
            <TabsTrigger value="servers" className="gap-2"><Server className="h-4 w-4" />Servers</TabsTrigger>
            <TabsTrigger value="directories" className="gap-2"><Globe className="h-4 w-4" />Directory Campaign</TabsTrigger>
            <TabsTrigger value="content" className="gap-2"><Sparkles className="h-4 w-4" />Content Engine</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2"><BarChart2 className="h-4 w-4" />Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="servers" className="space-y-4 mt-4">
            {serversLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading servers...</div>
            ) : servers.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">No MCP servers registered yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">Register your first server to start your marketing campaign.</p>
                  <Button className="mt-4 gap-2" onClick={() => { setEditServer(null); setShowServerForm(true); }}>
                    <Plus className="h-4 w-4" /> Register Server
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {servers.map(s => (
                  <Card key={s.id} className="border">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-base">{s.name}</span>
                            {s.isOwn && <Badge variant="secondary" className="text-xs">GalaxyBots</Badge>}
                            {s.clientName && <Badge variant="outline" className="text-xs">{s.clientName}</Badge>}
                          </div>
                          {s.description && <p className="text-sm text-muted-foreground mb-2">{s.description}</p>}
                          {s.sseUrl && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono mb-2">
                              <Zap className="h-3 w-3" />{s.sseUrl}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {(s.tags ?? []).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4 shrink-0">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => { setSelectedServerId(s.id); document.querySelector('[data-value="directories"]')?.dispatchEvent(new MouseEvent("click")); }}>
                            <Globe className="h-3.5 w-3.5" /> Directories
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditServer(s)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Remove ${s.name}?`)) deleteServer.mutate(s.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="directories" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-sm">Server:</Label>
              <Select value={selectedServerId?.toString() ?? ""} onValueChange={v => setSelectedServerId(Number(v))}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select an MCP server..." />
                </SelectTrigger>
                <SelectContent>
                  {servers.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedServerId ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Select a server above to manage its directory submissions.</CardContent></Card>
            ) : dirLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...</div>
            ) : (
              <div className="grid gap-3">
                {directories.map(dir => {
                  const status = dir.submission?.status ?? "not_started";
                  const isExpanded = expandedDirectory === dir.slug;
                  return (
                    <Card key={dir.slug} className="border">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                              {dir.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                {dir.name}
                                <Badge variant="outline" className="text-xs">{dir.category}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">{dir.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select value={status} onValueChange={v => updateDirectory.mutate({ serverId: selectedServerId, slug: dir.slug, data: { status: v } })}>
                              <SelectTrigger className={`h-7 text-xs w-36 border ${STATUS_COLORS[status]}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="not_started">Not Started</SelectItem>
                                <SelectItem value="pending">In Progress</SelectItem>
                                <SelectItem value="submitted">Submitted</SelectItem>
                                <SelectItem value="live">Live</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => generateListing(dir.slug)} disabled={generatingListingSlug === dir.slug}>
                              {generatingListingSlug === dir.slug ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              Generate
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={dir.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedDirectory(isExpanded ? null : dir.slug)}>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 space-y-3 pt-3 border-t">
                            <div>
                              <Label className="text-xs mb-1 block">Listing URL</Label>
                              <div className="flex gap-2">
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="https://mcp.so/server/your-server-slug"
                                  defaultValue={dir.submission?.listingUrl ?? ""}
                                  onBlur={e => { if (e.target.value !== (dir.submission?.listingUrl ?? "")) updateDirectory.mutate({ serverId: selectedServerId, slug: dir.slug, data: { listingUrl: e.target.value || null } }); }}
                                />
                                <Button variant="outline" size="sm" className="shrink-0 h-8 gap-1" asChild>
                                  <a href={dir.submitUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Submit</a>
                                </Button>
                              </div>
                            </div>
                            {dir.submission?.optimizedDescription && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <Label className="text-xs">AI-Generated Listing</Label>
                                  <CopyButton text={dir.submission.optimizedDescription} />
                                </div>
                                <div className="bg-muted rounded p-3 text-sm text-muted-foreground whitespace-pre-wrap">{dir.submission.optimizedDescription}</div>
                              </div>
                            )}
                            <div>
                              <Label className="text-xs mb-1 block">Notes</Label>
                              <Textarea
                                className="text-sm min-h-[60px]"
                                placeholder="Track submission status, contacts, feedback..."
                                defaultValue={dir.submission?.notes ?? ""}
                                onBlur={e => { if (e.target.value !== (dir.submission?.notes ?? "")) updateDirectory.mutate({ serverId: selectedServerId, slug: dir.slug, data: { notes: e.target.value || null } }); }}
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="content" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-sm">Server:</Label>
              <Select value={selectedServerId?.toString() ?? ""} onValueChange={v => setSelectedServerId(Number(v))}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select an MCP server..." />
                </SelectTrigger>
                <SelectContent>
                  {servers.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {CHANNELS.map(ch => (
                <Card
                  key={ch.id}
                  className={`cursor-pointer border-2 transition-colors ${selectedChannel === ch.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  onClick={() => { setSelectedChannel(ch.id); setGeneratedContent(""); }}
                >
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold mb-1">{ch.icon}</div>
                    <div className="font-medium text-sm">{ch.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{ch.sub}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={generateContent} disabled={!selectedServerId || generatingContent} className="gap-2">
                {generatingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate {CHANNELS.find(c => c.id === selectedChannel)?.label} Post
              </Button>
              {generatedContent && <Button variant="ghost" onClick={generateContent} disabled={generatingContent} className="gap-2"><RefreshCw className="h-4 w-4" />Regenerate</Button>}
            </div>

            {generatingContent && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
                  Writing your {CHANNELS.find(c => c.id === selectedChannel)?.label} post...
                </CardContent>
              </Card>
            )}

            {generatedContent && !generatingContent && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {CHANNELS.find(c => c.id === selectedChannel)?.label} Post — Ready to Publish
                    </CardTitle>
                    <CopyButton text={generatedContent} />
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground">{generatedContent}</pre>
                </CardContent>
              </Card>
            )}

            {!selectedServerId && !generatingContent && !generatedContent && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Select a server and channel, then click Generate to create ready-to-post content.</CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Calls (30d)</div>
                  <div className="text-3xl font-bold">{Number(analytics?.totalCalls ?? 0).toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Success Rate</div>
                  <div className="text-3xl font-bold text-green-500">{successRate}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Top Tool</div>
                  <div className="text-xl font-bold truncate">{analytics?.topTools?.[0]?.toolName ?? "—"}</div>
                  <div className="text-sm text-muted-foreground">{analytics?.topTools?.[0]?.calls ?? 0} calls</div>
                </CardContent>
              </Card>
            </div>

            {analytics?.topTools && analytics.topTools.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Top Tools (30d)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analytics.topTools.map((t, i) => {
                      const maxCalls = analytics.topTools[0]?.calls ?? 1;
                      const pct = Math.round((Number(t.calls) / Number(maxCalls)) * 100);
                      return (
                        <div key={t.toolName} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                          <span className="text-sm font-mono flex-1 truncate">{t.toolName}</span>
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm text-muted-foreground w-14 text-right">{Number(t.calls).toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {analytics?.dailyCalls && analytics.dailyCalls.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Daily Call Volume</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-24">
                    {analytics.dailyCalls.map(d => {
                      const maxCalls = Math.max(...analytics.dailyCalls.map(x => Number(x.calls)));
                      const pct = maxCalls > 0 ? (Number(d.calls) / maxCalls) * 100 : 0;
                      return (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.calls} calls`}>
                          <div className="w-full bg-primary/80 rounded-t" style={{ height: `${Math.max(pct, 3)}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{analytics.dailyCalls[0]?.day}</span>
                    <span className="text-xs text-muted-foreground">{analytics.dailyCalls[analytics.dailyCalls.length - 1]?.day}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {(!analytics || (analytics.totalCalls === 0 && (!analytics.topTools || analytics.topTools.length === 0))) && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No MCP call data yet. Analytics will populate as your server receives traffic.</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showServerForm} onOpenChange={setShowServerForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editServer ? "Edit MCP Server" : "Register MCP Server"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Server Name *</Label>
              <Input className="mt-1" value={serverForm.name} onChange={e => setServerForm(p => ({ ...p, name: e.target.value }))} placeholder="GalaxyBots.ai MCP" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1 min-h-[80px]" value={serverForm.description} onChange={e => setServerForm(p => ({ ...p, description: e.target.value }))} placeholder="What does this MCP server do? What tools does it expose?" />
            </div>
            <div>
              <Label>SSE Endpoint URL</Label>
              <Input className="mt-1" value={serverForm.sseUrl} onChange={e => setServerForm(p => ({ ...p, sseUrl: e.target.value }))} placeholder="https://yourdomain.com/__mcp/sse" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Auth Type</Label>
                <Select value={serverForm.authType} onValueChange={v => setServerForm(p => ({ ...p, authType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="oauth">OAuth 2.0</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Owner (Client ID)</Label>
                <Input className="mt-1" value={serverForm.clientId} onChange={e => setServerForm(p => ({ ...p, clientId: e.target.value }))} placeholder="Leave blank = GalaxyBots" />
              </div>
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input className="mt-1" value={serverForm.tags} onChange={e => setServerForm(p => ({ ...p, tags: e.target.value }))} placeholder="AEO, SEO, AI Visibility, Citation Monitoring" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isOwn" checked={serverForm.isOwn} onChange={e => setServerForm(p => ({ ...p, isOwn: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="isOwn" className="cursor-pointer">This is GalaxyBots' own MCP server</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowServerForm(false)}>Cancel</Button>
            <Button onClick={submitServerForm} disabled={!serverForm.name || createServer.isPending || updateServer.isPending} className="gap-2">
              {(createServer.isPending || updateServer.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editServer ? "Save Changes" : "Register Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
