import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Users, Globe, Activity, Check, Loader2,
  Terminal, ChevronRight, Star, Building2, Bot, Search, Download,
} from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SSE_URL = "https://galaxybots.ai/__mcp/sse";

interface SocialProof {
  active_integrations: number;
  total_tool_calls: number;
  sessions_today: number;
  directories_listed: number;
}

const EXAMPLE_PROMPTS = [
  {
    icon: <Building2 className="h-4 w-4 text-purple-400" />,
    label: "Revenue Intelligence",
    prompt: "Pull a real-time pipeline snapshot for my top 10 accounts, identify any deals stale in the past 14 days, and draft a re-engagement email for each.",
  },
  {
    icon: <Search className="h-4 w-4 text-blue-400" />,
    label: "Market Research",
    prompt: "Find 20 healthcare SaaS companies (100–500 employees) likely evaluating AI automation this quarter. Return enriched contacts and personalized outreach angles.",
  },
  {
    icon: <Bot className="h-4 w-4 text-green-400" />,
    label: "Compliance Audit",
    prompt: "Check compliance status across all active client accounts and flag any with open audit items older than 30 days. Summarize risk exposure.",
  },
];

const TIERS = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "For individual developers and explorers.",
    features: ["500 tool calls/month", "5 MCP tools", "Community support", "Remote HTTP access"],
    cta: "Start Free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For teams shipping AI-powered products.",
    features: ["25,000 tool calls/month", "All 20+ MCP tools", "Resources & Prompts", "Priority support", "OAuth 2.0 + API key auth"],
    cta: "Start Pro Trial",
    highlight: true,
  },
  {
    name: "Scale",
    price: "$499",
    period: "/month",
    description: "For enterprise deployments at scale.",
    features: ["Unlimited tool calls", "Custom tool development", "Dedicated SSE endpoint", "SLA guarantee", "SCIM provisioning", "White-label option"],
    cta: "Talk to Sales",
    highlight: false,
  },
];

function AnimatedCounter({ value }: { value: number }) {
  return (
    <span className="font-bold text-3xl tabular-nums">
      {value.toLocaleString()}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-xs text-purple-400 hover:text-purple-300 font-mono flex items-center gap-1 transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : null}
      {copied ? "Copied!" : "Copy URL"}
    </button>
  );
}

export default function McpLaunch() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const { data: socialProof } = useQuery<SocialProof>({
    queryKey: ["mcp-social-proof"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/mcp-marketing/social-proof`);
      if (!r.ok) throw new Error(`social-proof fetch failed: ${r.status}`);
      return r.json();
    },
    refetchInterval: 30000,
    retry: false,
  });

  const signup = useMutation({
    mutationFn: async (data: object) => {
      const r = await fetch(`${BASE}/api/mcp-marketing/launch-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`signup failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "You're on the list!", description: "We'll be in touch with early access details." });
      setEmail(""); setName(""); setCompany("");
    },
    onError: () => toast({ title: "Something went wrong", variant: "destructive" }),
  });

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    signup.mutate({ email, name, company, source: "launch_page" });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-purple-400" />
          <span className="font-bold text-base">GalaxyBots MCP</span>
          <Badge className="bg-purple-600/30 text-purple-300 border-purple-500/30 text-xs">Now Live</Badge>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/mcp-docs">
            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white text-sm">Docs</Button>
          </Link>
          <Link href="/pricing">
            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white text-sm">Pricing</Button>
          </Link>
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white text-sm">
            Get API Key
          </Button>
        </div>
      </div>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-black to-blue-900/20 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-800/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-900/40 border border-purple-500/30 rounded-full px-4 py-1.5 mb-8 text-sm text-purple-300">
            <Activity className="h-3.5 w-3.5" />
            {socialProof ? (
              <span>{Number(socialProof.total_tool_calls).toLocaleString()} tool calls served</span>
            ) : (
              <span>Now available for Claude Desktop, Code & VSCode</span>
            )}
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-none mb-6 bg-gradient-to-br from-white via-white to-purple-200 bg-clip-text text-transparent">
            Fortune 500 Intelligence.<br />For Everyone.
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            GalaxyBots MCP gives Claude and any AI agent real-time access to enterprise CRM data, compliance monitoring, market research, and your organization's knowledge base — in one API call.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <a href={`${BASE}/api/mcp-marketing/download-extension`} download="galaxybots-mcp.mcpb">
              <Button
                size="lg"
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 h-12 text-base font-semibold gap-2"
              >
                <Download className="h-4 w-4" />
                Install Desktop Extension
              </Button>
            </a>
            <Link href="/mcp-docs">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 h-12 px-8 text-base gap-2">
                <Terminal className="h-4 w-4" />
                View Docs
              </Button>
            </Link>
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-mono">Remote SSE Endpoint</span>
                <CopyButton text={SSE_URL} />
              </div>
              <div className="font-mono text-sm text-purple-300 break-all">{SSE_URL}</div>
            </div>
            <p className="text-xs text-gray-600 text-center">
              Works with Claude Desktop · Claude Code · VSCode · mcp-remote
            </p>
          </div>
        </div>
      </section>

      {socialProof && (
        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="max-w-4xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            <div>
              <AnimatedCounter value={socialProof.total_tool_calls} />
              <div className="text-sm text-gray-400 mt-1">Tool Calls Served</div>
            </div>
            <div>
              <AnimatedCounter value={socialProof.active_integrations} />
              <div className="text-sm text-gray-400 mt-1">Active Integrations</div>
            </div>
            <div>
              <AnimatedCounter value={socialProof.sessions_today} />
              <div className="text-sm text-gray-400 mt-1">Sessions Today</div>
            </div>
            <div>
              <AnimatedCounter value={socialProof.directories_listed} />
              <div className="text-sm text-gray-400 mt-1">Directories Listed</div>
            </div>
          </div>
        </section>
      )}

      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-3">Example Prompts</div>
          <h2 className="text-3xl font-bold text-white">What You Can Build</h2>
          <p className="text-gray-400 mt-3 max-w-xl mx-auto">Just paste these into Claude with your MCP server connected and watch it work.</p>
        </div>

        <div className="space-y-4 max-w-2xl mx-auto">
          {EXAMPLE_PROMPTS.map((p, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                  {p.icon}
                </div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{p.label}</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">U</div>
                <div className="bg-white/[0.07] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed flex-1">
                  {p.prompt}
                </div>
              </div>
              <div className="flex items-start gap-3 mt-3">
                <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-purple-200 leading-relaxed flex-1 italic">
                  Working on it via GalaxyBots MCP...
                  <span className="inline-flex gap-0.5 ml-2">
                    <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white/[0.02] border-y border-white/10 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-3">Pricing</div>
            <h2 className="text-3xl font-bold text-white">Simple, Transparent Plans</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {TIERS.map(tier => (
              <div
                key={tier.name}
                className={`rounded-2xl p-6 border relative ${
                  tier.highlight
                    ? "bg-purple-900/30 border-purple-500/40"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white border-purple-500 px-3">Most Popular</Badge>
                  </div>
                )}
                <div className="mb-4">
                  <div className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-1">{tier.name}</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-white">{tier.price}</span>
                    <span className="text-gray-400 text-sm">{tier.period}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{tier.description}</p>
                </div>
                <ul className="space-y-2 mb-6">
                  {tier.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <Check className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full ${tier.highlight ? "bg-purple-600 hover:bg-purple-700 text-white" : "border-white/20 text-white hover:bg-white/10"}`}
                  variant={tier.highlight ? "default" : "outline"}
                  onClick={() => { document.getElementById("email-signup")?.scrollIntoView({ behavior: "smooth" }); }}
                >
                  {tier.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="email-signup" className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-3">Early Access</div>
        <h2 className="text-3xl font-bold text-white mb-3">Be First to Integrate</h2>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Join the launch list for priority API key access, a personal onboarding session, and updates on new tools and capabilities.
        </p>

        <form onSubmit={handleSignup} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-11"
            />
            <Input
              placeholder="Company (optional)"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-11"
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 h-11 flex-1"
            />
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-6 font-semibold gap-2 shrink-0"
              disabled={signup.isPending}
            >
              {signup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              Join List
            </Button>
          </div>
        </form>

        <p className="text-xs text-gray-600 mt-4">No spam. Cancel anytime. We respect your inbox.</p>
      </section>

      <footer className="border-t border-white/10 py-8 px-6 text-center">
        <p className="text-xs text-gray-600">
          &copy; {new Date().getFullYear()} GalaxyBots &mdash;{" "}
          <Link href="/mcp-docs" className="text-purple-400 hover:text-purple-300">Developer Docs</Link>
          {" "}&bull;{" "}
          <Link href="/pricing" className="text-purple-400 hover:text-purple-300">Pricing</Link>
          {" "}&bull;{" "}
          <Link href="/mcp-growth-hub" className="text-purple-400 hover:text-purple-300">Growth Hub</Link>
        </p>
      </footer>
    </div>
  );
}
