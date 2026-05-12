import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Zap, AlertTriangle, CheckCircle2, Clock, Search, Eye, Pause, Play, Power, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface QueenStatus {
  queen: { mode: string; status: string; isSwarming: boolean; lastSwarmCycleAt: string | null };
  openThreats: number;
  activeBees: number;
  activePatrols: number;
  totalResolved: number;
  kiloProCompliance: Array<{ standardName: string; status: string; category: string; createdAt: string }>;
  pirateMonsterAeo: Array<{ sourceUrl: string; overallScore: number; scannedAt: string; clientId: number | null }>;
}

interface Incident {
  id: number;
  domain: string;
  title: string;
  description: string;
  severity: number;
  blastRadius: number;
  status: string;
  affectedComponent: string | null;
  createdAt: string;
  workers: Array<{ beeType: string; status: string; finding: string | null; proposedFix: string | null; confidenceScore: number | null }>;
  postmortem: { id: number; rootCause: string; appliedRemedy: string; preventionRecommendation: string; triggerEvent: string; timeline: string; createdAt: string } | null;
}

interface Patrol {
  id: number;
  name: string;
  domain: string;
  triggerPattern: string;
  recurrenceCount: number;
  isActive: string;
  lastTriggeredAt: string | null;
}

interface Postmortem {
  id: number;
  incidentId: number;
  triggerEvent: string;
  rootCause: string;
  appliedRemedy: string;
  preventionRecommendation: string;
  kiloProCompatible: string;
  createdAt: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  code: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  security: "bg-red-500/15 text-red-400 border-red-500/30",
  ai_safety: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  client_health: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  performance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  data_integrity: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  compliance: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  dependency: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  predictive: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  aeo: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  piratemonster: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

function severityColor(severity: number): string {
  if (severity >= 90) return "text-red-400";
  if (severity >= 70) return "text-orange-400";
  if (severity >= 50) return "text-yellow-400";
  return "text-emerald-400";
}

function SeverityBar({ value }: { value: number }) {
  const color = value >= 90 ? "bg-red-500" : value >= 70 ? "bg-orange-500" : value >= 50 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
    </div>
  );
}

export default function GuardianHive() {
  const { user } = useAuth();
  const [status, setStatus] = useState<QueenStatus | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [postmortems, setPostmortems] = useState<Postmortem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState(false);
  const [tab, setTab] = useState("threats");

  const isQueenAdmin = user?.role === "owner" && (user as { bypassPayment?: boolean })?.bypassPayment === true;

  const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/guardian/status`, { headers });
      if (r.ok) setStatus(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/guardian/incidents?limit=30`, { headers });
      if (r.ok) {
        const data = await r.json();
        setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchPatrols = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/guardian/patrols`, { headers });
      if (r.ok) {
        const data = await r.json();
        setPatrols(Array.isArray(data.patrols) ? data.patrols : []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchPostmortems = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/v1/guardian/postmortems?limit=20`, { headers });
      if (r.ok) {
        const data = await r.json();
        setPostmortems(Array.isArray(data.postmortems) ? data.postmortems : []);
      }
    } catch { /* silent */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchIncidents(), fetchPatrols(), fetchPostmortems()]);
    setLoading(false);
  }, [fetchStatus, fetchIncidents, fetchPatrols, fetchPostmortems]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const sseUrl = `${BASE}/api/sse?token=${encodeURIComponent(token)}`;
    const es = new EventSource(sseUrl);

    const GUARDIAN_EVENTS = [
      "guardian_threat_ingested",
      "guardian_swarm_start",
      "guardian_bees_dispatched",
      "guardian_incident_resolved",
      "guardian_postmortem_created",
      "guardian_patrol_created",
      "guardian_patrol_triggered",
      "guardian_mode_change",
      "guardian_resurrection",
      "kilopro_compliance_update",
    ];

    const handler = () => {
      fetchStatus();
      fetchIncidents();
    };
    for (const ev of GUARDIAN_EVENTS) {
      es.addEventListener(ev, handler);
    }

    es.onerror = () => { es.close(); };

    return () => {
      for (const ev of GUARDIAN_EVENTS) {
        es.removeEventListener(ev, handler);
      }
      es.close();
    };
  }, [token, fetchStatus, fetchIncidents]);

  const control = async (action: string) => {
    setControlLoading(true);
    try {
      await fetch(`${BASE}/api/v1/guardian/control`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action }),
      });
      await refresh();
    } catch { /* silent */ } finally {
      setControlLoading(false);
    }
  };

  const mode = status?.queen.mode ?? "active";
  const queenStatusLabel = status?.queen.status ?? "Unknown";

  const filteredPostmortems = search
    ? postmortems.filter((p) => p.rootCause.toLowerCase().includes(search.toLowerCase()) || p.triggerEvent.toLowerCase().includes(search.toLowerCase()))
    : postmortems;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-800/30 border border-violet-500/30 flex items-center justify-center">
            <Shield className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-tech tracking-tight">Guardian Hive</h1>
            <p className="text-sm text-muted-foreground">Sovereign AI Platform Intelligence — Colony never sleeps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
          <>
            {mode === "active" ? (
              <Button variant="outline" size="sm" onClick={isQueenAdmin ? () => control("pause") : undefined} disabled={controlLoading || !isQueenAdmin} title={!isQueenAdmin ? "Guardian Queen owner access required" : undefined}>
                <Pause className="w-4 h-4 mr-1" /> Pause Queen
              </Button>
            ) : mode === "paused" ? (
              <Button variant="outline" size="sm" onClick={isQueenAdmin ? () => control("resume") : undefined} disabled={controlLoading || !isQueenAdmin} title={!isQueenAdmin ? "Guardian Queen owner access required" : undefined}>
                <Play className="w-4 h-4 mr-1" /> Resume Queen
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={isQueenAdmin ? () => control("force_swarm") : undefined} disabled={controlLoading || !isQueenAdmin} title={!isQueenAdmin ? "Guardian Queen owner access required" : undefined}>
              <Zap className="w-4 h-4 mr-1" /> Force Swarm
            </Button>
            {mode !== "shutdown" && (
              <Button variant="destructive" size="sm" onClick={isQueenAdmin ? () => control("shutdown") : undefined} disabled={controlLoading || !isQueenAdmin} title={!isQueenAdmin ? "Guardian Queen owner access required" : undefined}>
                <Power className="w-4 h-4 mr-1" /> Shutdown
              </Button>
            )}
          </>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-1">
          <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider">Queen Status</div>
          <div className={cn("font-bold text-lg font-tech", mode === "active" ? "text-emerald-400" : mode === "paused" ? "text-yellow-400" : "text-red-400")}>
            {queenStatusLabel}
          </div>
          <div className="text-xs text-muted-foreground">Mode: {mode}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-1">
          <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider">Open Threats</div>
          <div className="font-bold text-2xl font-tech text-orange-400">{status?.openThreats ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-1">
          <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider">Active Bees</div>
          <div className="font-bold text-2xl font-tech text-violet-400">{status?.activeBees ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-1">
          <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider">Total Resolved</div>
          <div className="font-bold text-2xl font-tech text-emerald-400">{status?.totalResolved ?? "—"}</div>
        </div>
      </div>

      {status?.kiloProCompliance && status.kiloProCompliance.length > 0 && (
        <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-teal-400" />
            <span className="text-sm font-tech font-semibold text-teal-400 uppercase tracking-wider">KiloPro Compliance Ribbon</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {status.kiloProCompliance.map((k, i) => (
              <Badge key={i} variant="outline" className={cn("font-tech text-xs", k.status === "compliant" ? "border-emerald-500/40 text-emerald-400" : k.status === "at_risk" ? "border-yellow-500/40 text-yellow-400" : "border-red-500/40 text-red-400")}>
                {k.standardName} — {k.status}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {status?.pirateMonsterAeo && status.pirateMonsterAeo.length > 0 && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-tech font-semibold text-sky-400 uppercase tracking-wider">PirateMonster AEO Health</span>
            <span className="text-xs text-muted-foreground ml-auto">Last {status.pirateMonsterAeo.length} scans</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {status.pirateMonsterAeo.map((s, i) => {
              const scoreColor = s.overallScore >= 80 ? "border-emerald-500/40 text-emerald-400" : s.overallScore >= 60 ? "border-yellow-500/40 text-yellow-400" : "border-red-500/40 text-red-400";
              const label = s.sourceUrl.replace(/^https?:\/\//, "").slice(0, 40);
              return (
                <Badge key={i} variant="outline" className={cn("font-tech text-xs", scoreColor)} title={s.sourceUrl}>
                  {label} — {s.overallScore}/100
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="threats" className="font-tech text-xs">
            Threat Queue ({status?.openThreats ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history" className="font-tech text-xs">
            Incident History
          </TabsTrigger>
          <TabsTrigger value="patrols" className="font-tech text-xs">
            Patrol Registry ({patrols.length})
          </TabsTrigger>
          <TabsTrigger value="postmortems" className="font-tech text-xs">
            Post-Mortem Library
          </TabsTrigger>
        </TabsList>

        <TabsContent value="threats" className="space-y-3 mt-4">
          {incidents.filter((i) => i.status === "open" || i.status === "investigating").length === 0 ? (
            <div className="text-center text-muted-foreground py-12 font-tech text-sm">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              No active threats — colony is vigilant
            </div>
          ) : (
            incidents.filter((i) => i.status === "open" || i.status === "investigating").map((inc) => (
              <IncidentCard key={inc.id} inc={inc} />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-4">
          {incidents.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 font-tech text-sm">No incidents recorded yet</div>
          ) : (
            incidents.map((inc) => <IncidentCard key={inc.id} inc={inc} />)
          )}
        </TabsContent>

        <TabsContent value="patrols" className="space-y-3 mt-4">
          {patrols.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 font-tech text-sm">No standing patrols registered yet</div>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <table className="w-full text-sm font-tech">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Patrol</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Domain</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Recurrences</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Last Triggered</th>
                  </tr>
                </thead>
                <tbody>
                  {patrols.map((p) => (
                    <tr key={p.id} className="border-t border-border/30">
                      <td className="px-4 py-2 font-medium truncate max-w-xs">{p.name}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={cn("text-xs", DOMAIN_COLORS[p.domain] ?? "")}>{p.domain}</Badge>
                      </td>
                      <td className="px-4 py-2 text-orange-400">{p.recurrenceCount}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={p.isActive === "active" ? "border-emerald-500/40 text-emerald-400" : "border-muted"}>{p.isActive}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {p.lastTriggeredAt ? new Date(p.lastTriggeredAt).toLocaleString() : "never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="postmortems" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search post-mortems by root cause or trigger..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm font-tech text-sm"
            />
          </div>
          {filteredPostmortems.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 font-tech text-sm">No post-mortems yet</div>
          ) : (
            filteredPostmortems.map((pm) => (
              <div key={pm.id} className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-tech font-semibold text-sm">{pm.triggerEvent}</div>
                  <div className="flex items-center gap-2">
                    {pm.kiloProCompatible === "yes" && (
                      <Badge variant="outline" className="border-teal-500/40 text-teal-400 text-xs">KiloPro Compatible</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{new Date(pm.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-1">Root Cause</div>
                    <div className="text-foreground/80">{pm.rootCause}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Applied Remedy</div>
                    <div className="text-foreground/80">{pm.appliedRemedy}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Prevention</div>
                    <div className="text-foreground/80">{pm.preventionRecommendation}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IncidentCard({ inc }: { inc: Incident }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border bg-card/30 overflow-hidden transition-all",
      inc.status === "resolved" ? "border-border/30 opacity-80" : "border-border/50"
    )}>
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {inc.status === "resolved" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : inc.status === "investigating" ? (
            <Zap className="w-5 h-5 text-violet-400 animate-pulse" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-xs border", DOMAIN_COLORS[inc.domain] ?? "")}>{inc.domain}</Badge>
            <span className={cn("text-xs font-tech font-bold", severityColor(inc.severity))}>SEV {inc.severity}</span>
            <Badge variant="outline" className="text-xs">{inc.status}</Badge>
            {inc.affectedComponent && (
              <span className="text-xs text-muted-foreground truncate">{inc.affectedComponent}</span>
            )}
          </div>
          <div className="font-tech font-medium text-sm">{inc.title}</div>
          <SeverityBar value={inc.severity} />
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {new Date(inc.createdAt).toLocaleString()}
            {inc.workers.length > 0 && (
              <span className="text-violet-400">• {inc.workers.length} bee{inc.workers.length !== 1 ? "s" : ""} dispatched</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
          <Eye className="w-4 h-4" />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border/30 p-4 space-y-4">
          <div className="text-xs text-muted-foreground">{inc.description}</div>

          {inc.workers.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-tech font-semibold text-muted-foreground uppercase tracking-wider">Worker Bee Findings</div>
              {inc.workers.map((w, i) => (
                <div key={i} className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-tech">{w.beeType}</Badge>
                    <Badge variant="outline" className={cn("text-xs", w.status === "complete" ? "border-emerald-500/40 text-emerald-400" : "border-muted")}>{w.status}</Badge>
                    {w.confidenceScore !== null && (
                      <span className="text-xs text-muted-foreground">{((w.confidenceScore ?? 0) * 100).toFixed(0)}% confidence</span>
                    )}
                  </div>
                  {w.finding && <div className="text-xs">{w.finding}</div>}
                  {w.proposedFix && <div className="text-xs text-emerald-400/80">Fix: {w.proposedFix}</div>}
                </div>
              ))}
            </div>
          )}

          {inc.postmortem && (
            <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 space-y-2">
              <div className="text-xs font-tech font-semibold text-teal-400 uppercase tracking-wider">Post-Mortem</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Root Cause: </span>{inc.postmortem.rootCause}</div>
                <div><span className="text-muted-foreground">Remedy: </span>{inc.postmortem.appliedRemedy}</div>
                <div className="sm:col-span-2"><span className="text-muted-foreground">Prevention: </span>{inc.postmortem.preventionRecommendation}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
