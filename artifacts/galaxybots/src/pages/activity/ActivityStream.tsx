import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Zap,
  BarChart2,
  Globe,
  Terminal,
  Bell,
  GitBranch,
  CheckCircle2,
  Loader2,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Info,
  AlertOctagon,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ActivityEvent = {
  id: string;
  timestamp: string;
  source: "galaxybots" | "bingolingo" | "piratemonster" | "mcp" | "system";
  eventType: string;
  description: string;
  clientId: number | null;
  clientName?: string;
  severity: "info" | "warning" | "critical";
  link?: string;
  metadata?: unknown;
};

const SOURCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  galaxybots: {
    label: "GalaxyBots",
    icon: <Zap className="w-3.5 h-3.5" />,
    color: "text-primary border-primary/30 bg-primary/5",
  },
  bingolingo: {
    label: "BingoLingo",
    icon: <Globe className="w-3.5 h-3.5" />,
    color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/5",
  },
  piratemonster: {
    label: "PirateMonster",
    icon: <BarChart2 className="w-3.5 h-3.5" />,
    color: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  },
  mcp: {
    label: "MCP",
    icon: <Terminal className="w-3.5 h-3.5" />,
    color: "text-violet-400 border-violet-500/30 bg-violet-500/5",
  },
  system: {
    label: "System",
    icon: <Bell className="w-3.5 h-3.5" />,
    color: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  },
};

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  tool_call: { label: "Tool Call", icon: <Zap className="w-3 h-3" /> },
  aeo_update: { label: "AEO Update", icon: <BarChart2 className="w-3 h-3" /> },
  content_published: { label: "Content", icon: <Globe className="w-3 h-3" /> },
  mcp_call: { label: "MCP Call", icon: <Terminal className="w-3 h-3" /> },
  notification: { label: "Notification", icon: <Bell className="w-3 h-3" /> },
  workflow_run: { label: "Workflow Run", icon: <GitBranch className="w-3 h-3" /> },
  approval: { label: "Approval", icon: <CheckCircle2 className="w-3 h-3" /> },
  call: { label: "Call", icon: <Bell className="w-3 h-3" /> },
  session_outcome: { label: "Session", icon: <CheckCircle2 className="w-3 h-3" /> },
  prospect: { label: "Prospect", icon: <Filter className="w-3 h-3" /> },
};

const SEVERITY_CONFIG = {
  info: { icon: <Info className="w-3.5 h-3.5 text-blue-400" />, border: "border-l-blue-500/30" },
  warning: { icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, border: "border-l-amber-500/40" },
  critical: { icon: <AlertOctagon className="w-3.5 h-3.5 text-red-400" />, border: "border-l-red-500/50" },
};

function EventItem({ event }: { event: ActivityEvent }) {
  const source = SOURCE_CONFIG[event.source] ?? SOURCE_CONFIG.system;
  const evType = EVENT_TYPE_CONFIG[event.eventType];
  const sev = SEVERITY_CONFIG[event.severity];

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border-l-2 ${sev.border} bg-secondary/10 hover:bg-secondary/20 transition-colors`}>
      <div className="mt-0.5 shrink-0">{sev.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-foreground line-clamp-2">{event.description}</p>
          {event.link && (
            <Link href={event.link}>
              <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground shrink-0 mt-0.5" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge variant="outline" className={`text-[9px] flex items-center gap-1 ${source.color}`}>
            {source.icon}
            {source.label}
          </Badge>
          {evType && (
            <Badge variant="secondary" className="text-[9px] flex items-center gap-1">
              {evType.icon}
              {evType.label}
            </Badge>
          )}
          {event.clientName && (
            <span className="text-[10px] text-muted-foreground">{event.clientName}</span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ActivityStream() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const headers = { Authorization: `Bearer ${token}` };

  const [searchText, setSearchText] = useState("");
  const [platform, setPlatform] = useState("");
  const [eventType, setEventType] = useState("");
  const [severity, setSeverity] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [timeRange, setTimeRange] = useState("");
  const [newEventCount, setNewEventCount] = useState(0);
  const prevItemsRef = useRef<string[]>([]);
  const isFirstLoad = useRef(true);

  const { data: clientsData } = useQuery<{ id: number; companyName: string }[]>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/clients`, { headers });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.clients ?? []);
    },
  });

  const { data, isLoading, refetch, isFetching } = useQuery<{ items: ActivityEvent[]; total: number }>({
    queryKey: ["activity", platform, eventType, severity, selectedClientId, timeRange],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (platform) params.set("platform", platform);
      if (eventType) params.set("type", eventType);
      if (severity) params.set("severity", severity);
      if (selectedClientId) params.set("clientId", selectedClientId);
      if (timeRange) {
        const now = new Date();
        let sinceDate: Date;
        if (timeRange === "1h") sinceDate = new Date(now.getTime() - 60 * 60 * 1000);
        else if (timeRange === "24h") sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        else if (timeRange === "7d") sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        else sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.set("since", sinceDate.toISOString());
      }
      const res = await fetch(`${BASE}/api/activity?${params}`, { headers });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    refetchInterval: 20000,
  });

  const items = data?.items ?? [];

  useEffect(() => {
    if (!items.length) return;
    const currentIds = items.map((i) => i.id);
    if (isFirstLoad.current) {
      prevItemsRef.current = currentIds;
      isFirstLoad.current = false;
      return;
    }
    const newIds = currentIds.filter((id) => !prevItemsRef.current.includes(id));
    if (newIds.length > 0) {
      setNewEventCount((prev) => prev + newIds.length);
    }
    prevItemsRef.current = currentIds;
  }, [items]);

  useEffect(() => {
    if (!token) return;
    const url = `${BASE}/api/sse?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.addEventListener("activity", () => {
      setNewEventCount((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    });
    es.addEventListener("workflow-run", () => {
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    });
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [token, queryClient]);

  const filteredItems = items.filter((item) => {
    if (!searchText) return true;
    return item.description.toLowerCase().includes(searchText.toLowerCase()) ||
      item.clientName?.toLowerCase().includes(searchText.toLowerCase()) ||
      item.eventType.toLowerCase().includes(searchText.toLowerCase());
  });

  const handleScrollToTop = () => {
    setNewEventCount(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Activity Stream
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Unified real-time feed across all platforms and services
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => { refetch(); setNewEventCount(0); }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Search events..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">All Platforms</option>
            <option value="galaxybots">GalaxyBots</option>
            <option value="bingolingo">BingoLingo</option>
            <option value="piratemonster">PirateMonster</option>
            <option value="mcp">MCP</option>
            <option value="system">System</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            <option value="">All Event Types</option>
            <option value="tool_call">Tool Calls</option>
            <option value="aeo_update">AEO Updates</option>
            <option value="content_published">Content</option>
            <option value="mcp_call">MCP Calls</option>
            <option value="notification">Notifications</option>
            <option value="workflow_run">Workflow Runs</option>
            <option value="approval">Approvals</option>
            <option value="call">Calls</option>
            <option value="session_outcome">Sessions</option>
            <option value="prospect">Prospects</option>
            <option value="prospect_outreach">Outreach</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          {clientsData && clientsData.length > 1 && (
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="">All Clients</option>
              {clientsData.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.companyName}</option>
              ))}
            </select>
          )}
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="">All Time</option>
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>

        {newEventCount > 0 && (
          <button
            className="w-full py-2 text-xs text-center rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
            onClick={handleScrollToTop}
          >
            {newEventCount} new event{newEventCount !== 1 ? "s" : ""} — click to refresh
          </button>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No events found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </div>
        )}

        {filteredItems.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Showing {filteredItems.length} of {data?.total ?? 0} events
          </p>
        )}
      </div>
    </AppLayout>
  );
}
