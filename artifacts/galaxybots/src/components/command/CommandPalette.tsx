import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBots } from "@/hooks/use-bots";
import { useClients } from "@/hooks/use-clients";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveClient } from "@/contexts/ActiveClientContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Search,
  Bot,
  Building2,
  Zap,
  Clock,
  LayoutDashboard,
  ChevronRight,
  Rocket,
  BarChart2,
  FileText,
  Library,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: "Navigation" | "Bots" | "Clients" | "Actions" | "Recent";
  action: () => void;
  icon?: React.ReactNode;
  keywords?: string[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Navigation: <LayoutDashboard className="w-3.5 h-3.5" />,
  Bots: <Bot className="w-3.5 h-3.5" />,
  Clients: <Building2 className="w-3.5 h-3.5" />,
  Actions: <Zap className="w-3.5 h-3.5" />,
  Recent: <Clock className="w-3.5 h-3.5" />,
};

const CATEGORY_ORDER = ["Recent", "Navigation", "Bots", "Clients", "Actions"];

function fuzzyScore(query: string, text: string | null | undefined): number {
  if (!query) return 1;
  if (!text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 10;
  if (t.startsWith(q)) return 8;
  if (t.includes(q)) return 6;

  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1 + (lastMatch === ti - 1 ? 2 : 0);
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

const RECENT_KEY = "galaxybots_recent_pages";
const MAX_RECENT = 5;

function getRecentPages(): Array<{ path: string; label: string }> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addRecentPage(path: string, label: string) {
  const recent = getRecentPages().filter((r) => r.path !== path);
  recent.unshift({ path, label });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

const STATIC_ROUTES: Array<{ href: string; label: string; description?: string; keywords?: string[] }> = [
  { href: "/command-center", label: "Command Center", description: "Overview for owners and admins", keywords: ["dashboard", "home"] },
  { href: "/bots", label: "Bot Roster", description: "Manage your AI bots", keywords: ["team", "agents"] },
  { href: "/clients", label: "Clients", description: "Client management", keywords: ["accounts"] },
  { href: "/analytics", label: "Analytics", description: "Data analytics dashboard", keywords: ["roi", "metrics", "stats"] },
  { href: "/deploy-team", label: "Deploy Team", description: "Launch a cross-functional AI task team", keywords: ["mission", "optima", "launch"] },
  { href: "/task-rooms", label: "Task Rooms", description: "Active collaborative task sessions", keywords: ["sessions", "boardroom"] },
  { href: "/boardroom", label: "Boardroom", description: "Strategic discussions", keywords: ["strategy"] },
  { href: "/knowledge-base", label: "Knowledge Base", description: "Knowledge repository" },
  { href: "/documents", label: "Documents", description: "Document studio" },
  { href: "/pipelines", label: "Pipelines", description: "Automation pipelines" },
  { href: "/compliance", label: "Compliance", description: "Compliance tracking" },
  { href: "/governance", label: "Governance", description: "Governance controls" },
  { href: "/billing", label: "Billing", description: "Billing and subscription" },
  { href: "/proposals", label: "Proposals", description: "Proposal studio" },
  { href: "/prospects", label: "Prospects", description: "Prospect pipeline" },
  { href: "/prospector", label: "Prospector", description: "Autonomous B2B intelligence" },
  { href: "/integrations", label: "Integrations", description: "Third-party connections" },
  { href: "/marketplace", label: "Marketplace", description: "Apps and add-ons" },
  { href: "/settings", label: "Settings", description: "User settings" },
  { href: "/notifications", label: "Notifications", description: "Notification center" },
  { href: "/journal", label: "Journal", description: "Activity journal" },
  { href: "/scenarios", label: "Scenarios", description: "Scenario planning" },
  { href: "/roi", label: "ROI Dashboard", description: "Return on investment overview", keywords: ["roi", "revenue"] },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAeoScan?: () => void;
}

export function CommandPalette({ open, onOpenChange, onOpenAeoScan }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { setActiveClient } = useActiveClient();

  const { data: bots } = useBots();
  const { data: clients } = useClients();

  const recentPages = getRecentPages();

  const staticActions = useCallback((): Array<{ id: string; label: string; description?: string; keywords?: string[]; action: () => void; icon?: React.ReactNode }> => {
    const clientId = user?.clientId;
    return [
      {
        id: "deploy-team",
        label: "Deploy Task Team",
        description: "Launch a new mission with Optima Prime",
        keywords: ["mission", "launch", "optima", "deploy"],
        icon: <Rocket className="w-4 h-4 text-primary/70" />,
        action: () => {
          addRecentPage("/deploy-team", "Deploy Team");
          navigate("/deploy-team");
          onOpenChange(false);
        },
      },
      {
        id: "browse-templates",
        label: "Browse Mission Templates",
        description: "Open the mission template library",
        keywords: ["template", "library", "mission"],
        icon: <Library className="w-4 h-4 text-violet-400/70" />,
        action: () => {
          navigate("/deploy-team?templates=true");
          onOpenChange(false);
        },
      },
      {
        id: "view-approvals",
        label: "View Pending Approvals",
        description: "Command Center — pending bot approval requests",
        keywords: ["approve", "pending", "governance", "permissions", "approvals", "command center"],
        icon: <ShieldCheck className="w-4 h-4 text-yellow-400/70" />,
        action: () => {
          addRecentPage("/command-center?scroll=approvals", "Command Center — Approvals");
          navigate("/command-center?scroll=approvals");
          onOpenChange(false);
        },
      },
      {
        id: "run-aeo-scan",
        label: "Run AEO Scan",
        description: "Request an AEO scan for a specific URL",
        keywords: ["aeo", "scan", "intelligence", "seo", "ai visibility", "piratemonster"],
        icon: <BarChart2 className="w-4 h-4 text-blue-400/70" />,
        action: () => {
          onOpenChange(false);
          if (onOpenAeoScan) {
            onOpenAeoScan();
          } else if (clientId) {
            navigate(`/clients/${clientId}?tab=intelligence`);
          } else {
            navigate("/clients");
          }
        },
      },
      {
        id: "morning-brief",
        label: "Send Morning Brief Now",
        description: "Generate a fresh executive briefing",
        keywords: ["brief", "morning", "report", "executive", "summary"],
        icon: <Send className="w-4 h-4 text-emerald-400/70" />,
        action: async () => {
          onOpenChange(false);
          if (!clientId) {
            toast({ title: "No client found", variant: "destructive" });
            return;
          }
          const token = localStorage.getItem("auth_token");
          toast({ title: "Generating briefing...", description: "This may take a moment." });
          try {
            const res = await fetch(`${BASE}/api/briefings/trigger`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            });
            if (res.ok) {
              toast({ title: "Morning brief ready", description: "Your executive briefing has been generated." });
              navigate("/roi");
            } else {
              toast({ title: "Briefing failed", description: "Could not generate briefing. Try from the ROI dashboard.", variant: "destructive" });
              navigate("/roi");
            }
          } catch {
            toast({ title: "Briefing failed", variant: "destructive" });
            navigate("/roi");
          }
        },
      },
    ];
  }, [user, navigate, onOpenChange, toast]);

  const allItems = useCallback((): Array<CommandItem & { _score: number }> => {
    const items: Array<CommandItem & { _score: number }> = [];

    if (!query) {
      recentPages.forEach((r) => {
        items.push({
          id: `recent-${r.path}`,
          label: r.label,
          description: r.path,
          category: "Recent",
          icon: <Clock className="w-4 h-4 text-muted-foreground" />,
          action: () => {
            navigate(r.path);
            onOpenChange(false);
          },
          _score: 1,
        });
      });
    }

    STATIC_ROUTES.forEach((route) => {
      const score = Math.max(
        fuzzyScore(query, route.label),
        ...(route.keywords || []).map((k) => fuzzyScore(query, k)),
        route.description ? fuzzyScore(query, route.description) : 0
      );
      if (!query || score > 0) {
        items.push({
          id: `nav-${route.href}`,
          label: route.label,
          description: route.description,
          category: "Navigation",
          keywords: route.keywords,
          action: () => {
            addRecentPage(route.href, route.label);
            navigate(route.href);
            onOpenChange(false);
          },
          _score: score,
        });
      }
    });

    (bots || []).forEach((bot) => {
      const score = Math.max(
        fuzzyScore(query, bot.name),
        fuzzyScore(query, bot.title || ""),
        fuzzyScore(query, bot.department || ""),
        query ? 0 : fuzzyScore("talk to", "talk to")
      );
      if (!query || score > 0) {
        items.push({
          id: `bot-${bot.id}`,
          label: bot.name,
          description: `Talk to ${bot.title} — ${bot.department}`,
          category: "Bots",
          icon: <Bot className="w-4 h-4 text-primary/70" />,
          action: () => {
            addRecentPage(`/bots/${bot.id}`, bot.name);
            navigate(`/bots/${bot.id}?startChat=true`);
            onOpenChange(false);
          },
          _score: score,
        });
      }
    });

    (clients || []).forEach((client: { id: number; companyName?: string; name?: string; industry?: string | null }) => {
      const displayName = client.companyName || client.name || "";
      const score = Math.max(
        fuzzyScore(query, displayName),
        fuzzyScore(query, client.industry || "")
      );
      if (!query || score > 0) {
        items.push({
          id: `client-${client.id}`,
          label: displayName,
          description: `Switch to ${displayName}${client.industry ? ` — ${client.industry}` : ""}`,
          category: "Clients",
          icon: <Building2 className="w-4 h-4 text-blue-400/70" />,
          action: () => {
            setActiveClient(client.id, displayName);
            addRecentPage(`/clients/${client.id}`, displayName);
            navigate(`/clients/${client.id}`);
            toast({ title: `Switched to ${displayName}`, description: "Active client context updated." });
            onOpenChange(false);
          },
          _score: score,
        });
      }
    });

    staticActions().forEach((action) => {
      const score = Math.max(
        fuzzyScore(query, action.label),
        ...(action.keywords || []).map((k) => fuzzyScore(query, k)),
        action.description ? fuzzyScore(query, action.description) : 0
      );
      if (!query || score > 0) {
        items.push({
          id: `action-${action.id}`,
          label: action.label,
          description: action.description,
          category: "Actions",
          icon: action.icon || <Zap className="w-4 h-4 text-yellow-400/70" />,
          action: action.action,
          _score: score,
        });
      }
    });

    return items;
  }, [query, bots, clients, navigate, onOpenChange, staticActions, setActiveClient, toast]);

  const grouped = useCallback(() => {
    const items = allItems();
    const groups: Record<string, Array<CommandItem & { _score: number }>> = {};
    items.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    Object.keys(groups).forEach((cat) => {
      if (cat !== "Recent") {
        groups[cat].sort((a, b) => b._score - a._score);
      }
    });
    return groups;
  }, [allItems]);

  const flatItems = useCallback(() => {
    const groups = grouped();
    const result: CommandItem[] = [];
    CATEGORY_ORDER.forEach((cat) => {
      if (groups[cat]) result.push(...groups[cat]);
    });
    return result;
  }, [grouped]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = flatItems();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[selectedIdx]?.action();
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [flatItems, selectedIdx, onOpenChange]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-selected="true"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const groups = grouped();
  const flat = flatItems();
  let globalIdx = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl w-full overflow-hidden bg-background/95 backdrop-blur-xl border-primary/30 shadow-2xl">
        <div className="flex items-center border-b border-border/50 px-4">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0 mr-3" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, bots, clients, or actions..."
            className="border-0 ring-0 focus-visible:ring-0 bg-transparent h-14 text-base font-tech placeholder:text-muted-foreground/50"
          />
          <kbd className="hidden sm:flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground ml-2">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {flat.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground font-tech">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {CATEGORY_ORDER.map((category) => {
            const items = groups[category];
            if (!items || items.length === 0) return null;

            return (
              <div key={category} className="mb-1">
                <div className="flex items-center gap-2 px-4 py-1.5 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
                  <span className="text-muted-foreground">{CATEGORY_ICONS[category]}</span>
                  <span className="text-[10px] font-tech font-semibold uppercase tracking-widest text-muted-foreground">
                    {category}
                  </span>
                </div>
                {items.map((item) => {
                  const itemGlobalIdx = globalIdx++;
                  const isSelected = itemGlobalIdx === selectedIdx;

                  return (
                    <button
                      key={item.id}
                      data-selected={isSelected}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIdx(itemGlobalIdx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isSelected ? "bg-primary/10 text-foreground" : "text-foreground/80 hover:bg-accent/50"
                      )}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background/60 border border-border/40 flex items-center justify-center">
                        {item.icon || CATEGORY_ICONS[item.category]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-tech font-medium text-sm truncate">{item.label}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                        )}
                      </div>
                      {isSelected && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/40 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground font-tech">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd> select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 font-mono">ESC</kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 font-mono">?</kbd> shortcuts
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
