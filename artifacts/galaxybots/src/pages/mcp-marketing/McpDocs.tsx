import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Zap, Copy, Check, ExternalLink, Terminal, Code,
  ChevronDown, ChevronUp, Shield, BookOpen, Loader2,
} from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SSE_URL = "https://galaxybots.ai/__mcp/sse";
const INSPECTOR_URL = `https://inspector.tools.modelcontextprotocol.io/?serverUrl=${encodeURIComponent(SSE_URL)}`;

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

interface McpToolsResponse {
  tools: McpTool[];
}

function CopyBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className={`bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 overflow-x-auto font-mono leading-relaxed`}>
        <code>{code}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-700 hover:bg-zinc-600 rounded px-2 py-1 text-xs text-zinc-300 flex items-center gap-1"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ToolCard({ tool }: { tool: McpTool }) {
  const [expanded, setExpanded] = useState(false);
  const props = tool.inputSchema.properties ?? {};
  const required = tool.inputSchema.required ?? [];

  const exampleInput: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (val.enum) exampleInput[key] = val.enum[0];
    else if (val.type === "number" || val.type === "integer") exampleInput[key] = 1;
    else if (val.type === "boolean") exampleInput[key] = true;
    else exampleInput[key] = `<${key}>`;
  }

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50">
      <div
        className="flex items-start justify-between p-4 cursor-pointer hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-semibold text-purple-400 font-mono">{tool.name}</code>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed pr-4">{tool.description}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-zinc-500">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-950/50">
          {Object.keys(props).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Input Parameters</div>
              <div className="space-y-2">
                {Object.entries(props).map(([key, val]) => (
                  <div key={key} className="flex items-start gap-3 text-sm">
                    <code className="text-purple-400 font-mono shrink-0">{key}</code>
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-500 shrink-0">{val.type}</Badge>
                    {required.includes(key) && <Badge variant="outline" className="text-xs border-red-900/50 text-red-400 shrink-0">required</Badge>}
                    {val.description && <span className="text-zinc-500">{val.description}</span>}
                    {val.enum && <span className="text-zinc-600 font-mono text-xs">{val.enum.join(" | ")}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Example Call</div>
            <CopyBlock code={JSON.stringify({ tool: tool.name, input: exampleInput }, null, 2)} />
          </div>

          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Example Response</div>
            <CopyBlock code={JSON.stringify(getExampleResponse(tool.name), null, 2)} />
          </div>
        </div>
      )}
    </div>
  );
}

function getExampleResponse(toolName: string): unknown {
  const EXAMPLE_RESPONSES: Record<string, unknown> = {
    crm_get_clients: { clients: [{ id: 1, companyName: "Acme Corp", contactEmail: "ceo@acme.com", status: "active", plan: "enterprise", healthScore: 87 }], total: 142 },
    pipeline_snapshot: { stages: [{ name: "Proposal Sent", deals: 4, value: 340000 }, { name: "Negotiation", deals: 2, value: 185000 }, { name: "Closed Won", deals: 7, value: 620000 }], totalValue: 1145000 },
    prospecting_search: { prospects: [{ company: "HealthTech Innovations", employees: 220, industry: "Healthcare SaaS", signal: "Hiring AI engineers", score: 94 }], total: 20 },
    compliance_status: { accounts: [{ clientId: 1, name: "Acme Corp", status: "compliant", openItems: 0 }, { clientId: 2, name: "GlobalCo", status: "at_risk", openItems: 3, oldestItemDays: 45 }] },
    knowledge_search: { results: [{ id: "doc-42", title: "AI Deployment Runbook", snippet: "...follow these steps to deploy the agent to production...", score: 0.94 }], total: 8 },
    analytics_summary: { totalRevenue: 2840000, activeClients: 47, avgHealthScore: 82, toolCallsThisMonth: 14200 },
    bot_roster: { bots: [{ id: 1, name: "Revenue Bot", type: "crm_intelligence", status: "active" }, { id: 2, name: "Compliance Bot", type: "audit", status: "active" }] },
    create_brief: { brief: { id: "brief-77", title: "Q1 Pipeline Review", summary: "Pipeline up 18% QoQ...", keyInsights: ["4 deals at risk", "Top performer: Acme Corp"], createdAt: new Date().toISOString() } },
    task_session_create: { sessionId: "ts-8821", status: "running", agentsDeployed: 3, estimatedCompletionMs: 45000 },
  };
  return EXAMPLE_RESPONSES[toolName] ?? {
    ok: true,
    result: `[${toolName} result]`,
    timestamp: new Date().toISOString(),
  };
}

const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "galaxybots": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${SSE_URL}"],
      "env": {
        "GALAXYBOTS_API_KEY": "your-api-key"
      }
    }
  }
}`;

const CLAUDE_CODE_CONFIG = `claude mcp add galaxybots \\
  --transport http \\
  --url ${SSE_URL} \\
  --header "Authorization: Bearer your-api-key"`;

const VSCODE_CONFIG = `{
  "mcp": {
    "servers": {
      "galaxybots": {
        "type": "http",
        "url": "${SSE_URL}",
        "headers": {
          "Authorization": "Bearer your-api-key"
        }
      }
    }
  }
}`;

const MCP_REMOTE_CONFIG = `npx mcp-remote ${SSE_URL} \\
  --header "Authorization: Bearer your-api-key"`;

const SCOPES = [
  { scope: "tools:read", description: "Read-only access to all MCP tools", tier: "Starter" },
  { scope: "crm:read", description: "Read client, pipeline, and contact data", tier: "Pro" },
  { scope: "crm:write", description: "Create and update CRM records", tier: "Pro" },
  { scope: "compliance:read", description: "Read compliance status and audit logs", tier: "Pro" },
  { scope: "knowledge:read", description: "Search knowledge base and documents", tier: "Pro" },
  { scope: "prospects:write", description: "Create and enrich prospect records", tier: "Pro" },
  { scope: "analytics:read", description: "Access analytics and reporting data", tier: "Scale" },
  { scope: "admin:*", description: "Full administrative access", tier: "Scale" },
];

const OAUTH_FLOW = `1. Client requests authorization
   GET /api/oauth/authorize?client_id=...&scope=crm:read&redirect_uri=...

2. User approves → redirect with code
   → your-redirect-uri?code=auth_code_here

3. Exchange code for token
   POST /api/oauth/token
   { grant_type: "authorization_code", code: "...", client_id: "...", client_secret: "..." }

4. Use token in MCP headers
   Authorization: Bearer access_token_here`;

export default function McpDocs() {
  const [search, setSearch] = useState("");

  const { data: toolsData, isLoading } = useQuery<McpToolsResponse>({
    queryKey: ["mcp-tools-catalog"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/__mcp/tools`);
      if (!r.ok) throw new Error(`MCP tools fetch failed: ${r.status}`);
      return r.json();
    },
    retry: false,
  });

  const tools = toolsData?.tools ?? [];
  const filtered = tools.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/mcp-launch">
            <div className="flex items-center gap-2 cursor-pointer">
              <Zap className="h-5 w-5 text-purple-400" />
              <span className="font-bold text-base text-white">GalaxyBots MCP</span>
            </div>
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400 text-sm">Developer Docs</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={INSPECTOR_URL} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2 text-sm">
              <Terminal className="h-3.5 w-3.5" />
              Test Live
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Button>
          </a>
          <Link href="/mcp-launch">
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white text-sm">Get API Key</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-10">
          <Badge className="bg-purple-900/40 text-purple-300 border-purple-500/30 mb-4 text-xs">Reference</Badge>
          <h1 className="text-4xl font-extrabold text-white mb-3">MCP Server Documentation</h1>
          <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
            Connect Claude and any MCP-compatible agent to live enterprise data — pipelines, compliance, prospects, knowledge, and more.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 font-mono text-sm text-purple-300 select-all">
              {SSE_URL}
            </div>
            <a href={INSPECTOR_URL} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1.5 text-xs">
                Open in MCP Inspector
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </div>
        </div>

        <Tabs defaultValue="tools">
          <TabsList className="bg-zinc-900 border border-zinc-800 mb-8 flex-wrap h-auto gap-1">
            <TabsTrigger value="tools" className="gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Code className="h-3.5 w-3.5" />Tool Catalog
            </TabsTrigger>
            <TabsTrigger value="connect" className="gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Terminal className="h-3.5 w-3.5" />Connection Methods
            </TabsTrigger>
            <TabsTrigger value="oauth" className="gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <Shield className="h-3.5 w-3.5" />Auth & Scopes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Available Tools</h2>
                <p className="text-sm text-zinc-500">
                  {isLoading ? "Loading..." : `${tools.length} tools available`}
                </p>
              </div>
              <a href={INSPECTOR_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2 text-xs">
                  Test Live in Inspector
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </a>
            </div>

            <input
              type="text"
              placeholder="Search tools..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-purple-500 mb-4"
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading tool catalog from live MCP server...
              </div>
            ) : filtered.length === 0 && tools.length === 0 ? (
              <div className="border border-zinc-800 rounded-xl p-8 text-center">
                <Terminal className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Tool catalog requires the MCP server to be running.</p>
                <p className="text-zinc-600 text-xs mt-1">Below is a static reference of available tool categories.</p>
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
                  {[
                    { name: "crm_get_clients", desc: "List and search CRM clients" },
                    { name: "prospecting_search", desc: "AI-powered prospect research" },
                    { name: "compliance_status", desc: "Check compliance for accounts" },
                    { name: "knowledge_search", desc: "Semantic knowledge base search" },
                    { name: "pipeline_snapshot", desc: "Real-time deal pipeline data" },
                    { name: "analytics_summary", desc: "Business analytics overview" },
                    { name: "bot_roster", desc: "List configured AI agents" },
                    { name: "create_brief", desc: "Generate intelligence briefs" },
                    { name: "task_sessions", desc: "Manage autonomous task rooms" },
                  ].map(t => (
                    <div key={t.name} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                      <code className="text-purple-400 text-xs font-mono block mb-1">{t.name}</code>
                      <p className="text-zinc-500 text-xs">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No tools match "{search}"</p>
            ) : (
              <div className="space-y-2">
                {filtered.map(tool => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="connect" className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Connection Methods</h2>
              <p className="text-sm text-zinc-500 mb-6">Choose the right integration method for your Claude client.</p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded bg-amber-600/20 flex items-center justify-center">
                    <Terminal className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <h3 className="font-semibold text-white">Claude Desktop (stdio via mcp-remote)</h3>
                  <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-500">Recommended</Badge>
                </div>
                <p className="text-sm text-zinc-500 mb-3">Add this to your <code className="text-purple-400">~/Library/Application Support/Claude/claude_desktop_config.json</code></p>
                <CopyBlock code={CLAUDE_DESKTOP_CONFIG} />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded bg-blue-600/20 flex items-center justify-center">
                    <Terminal className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-white">Claude Code (CLI)</h3>
                </div>
                <p className="text-sm text-zinc-500 mb-3">Run this command once in your terminal:</p>
                <CopyBlock code={CLAUDE_CODE_CONFIG} language="bash" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded bg-blue-800/20 flex items-center justify-center">
                    <Code className="h-3.5 w-3.5 text-blue-300" />
                  </div>
                  <h3 className="font-semibold text-white">VSCode (Copilot MCP Extension)</h3>
                </div>
                <p className="text-sm text-zinc-500 mb-3">Add to your VSCode <code className="text-purple-400">settings.json</code>:</p>
                <CopyBlock code={VSCODE_CONFIG} />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded bg-green-600/20 flex items-center justify-center">
                    <Terminal className="h-3.5 w-3.5 text-green-400" />
                  </div>
                  <h3 className="font-semibold text-white">Remote HTTP via mcp-remote</h3>
                </div>
                <p className="text-sm text-zinc-500 mb-3">For any stdio-only client that needs HTTP bridge:</p>
                <CopyBlock code={MCP_REMOTE_CONFIG} language="bash" />
              </div>

              <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <ExternalLink className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-white mb-1">Test with MCP Inspector</h4>
                    <p className="text-sm text-zinc-400 mb-3">Browse all tools, run calls, and inspect schemas in the official MCP Inspector — pre-filled with the GalaxyBots endpoint.</p>
                    <a href={INSPECTOR_URL} target="_blank" rel="noreferrer">
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-2 text-sm">
                        Open MCP Inspector
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="oauth" className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Authentication & Scopes</h2>
              <p className="text-sm text-zinc-500 mb-6">GalaxyBots MCP supports API key auth (simple) and OAuth 2.0 (enterprise).</p>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-400" />
                  API Key Auth (Quick Start)
                </h3>
                <p className="text-sm text-zinc-500 mb-3">Pass your API key in the Authorization header on every request:</p>
                <CopyBlock code={`Authorization: Bearer YOUR_GALAXYBOTS_API_KEY`} />
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-400" />
                  OAuth 2.0 Authorization Code Flow
                </h3>
                <p className="text-sm text-zinc-500 mb-3">For production integrations that require user-level authorization:</p>
                <CopyBlock code={OAUTH_FLOW} />
              </div>

              <div>
                <h3 className="font-semibold text-white mb-3">Scope Reference</h3>
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900 border-b border-zinc-800">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-widest">Scope</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-widest">Description</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SCOPES.map((s, i) => (
                        <tr key={s.scope} className={`border-b border-zinc-900 ${i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/30"}`}>
                          <td className="px-4 py-3">
                            <code className="text-purple-400 font-mono text-xs">{s.scope}</code>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">{s.description}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs border-zinc-700 ${
                              s.tier === "Scale" ? "text-amber-400 border-amber-900/50" :
                              s.tier === "Pro" ? "text-purple-400 border-purple-900/50" :
                              "text-zinc-400"
                            }`}>
                              {s.tier}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
