import { fetchAllPages } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Loader2, Search, Building, Phone, Mail, Globe, ExternalLink,
  CheckCircle, XCircle, Edit3, AlertTriangle, Users, TrendingUp,
  ArrowRight, Calendar, MessageSquare, UserCheck
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Prospect = {
  id: number;
  clientId: number | null;
  companyName: string;
  domain: string | null;
  phone: string | null;
  email: string | null;
  socialLinks: Record<string, string> | null;
  sourceUrl: string;
  confidenceScore: number;
  status: string;
  errorCategory: string | null;
  attemptCount: number;
  extractionNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProspectStats = {
  total: number;
  statusCounts: Record<string, number>;
};

type FunnelStage = {
  stage: string;
  count: number;
  conversionRate: number;
  avgDays: number | null;
};

type FunnelData = {
  stages: FunnelStage[];
  avgDaysToConversion: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  new: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  enriched: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  review_needed: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  qualified: "text-primary border-primary/30 bg-primary/10",
  contacted: "text-cyan border-cyan/30 bg-cyan/10",
  rejected: "text-red-400 border-red-400/30 bg-red-400/10",
  responded: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  converted: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  enriched: "Enriched",
  review_needed: "Review Needed",
  qualified: "Qualified",
  contacted: "Contacted",
  rejected: "Rejected",
  responded: "Responded",
  converted: "Converted",
};

const FUNNEL_COLORS = [
  "bg-blue-500",
  "bg-cyan-500",
  "bg-primary",
  "bg-amber-500",
  "bg-violet-500",
  "bg-emerald-500",
];

function confidenceColor(score: number) {
  if (score >= 0.75) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-red-400";
}

function confidenceBg(score: number) {
  if (score >= 0.75) return "bg-emerald-400/10 border-emerald-400/30";
  if (score >= 0.6) return "bg-amber-400/10 border-amber-400/30";
  return "bg-red-400/10 border-red-400/30";
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type ClientOption = {
  id: number;
  companyName: string;
};

export default function Prospects() {
  const prefersReducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [tab, setTab] = useState<"pipeline" | "review" | "funnel">("pipeline");
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [editForm, setEditForm] = useState({ phone: "", email: "", domain: "", companyName: "" });

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const data = await fetchAllPages<{ id: number; companyName: string }>(`${BASE}/api/clients`);
      return data.map((c) => ({
        id: c.id,
        companyName: c.companyName,
      }));
    },
  });

  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: ["prospects", statusFilter, clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (clientFilter !== "all") params.set("clientId", clientFilter);
      params.set("limit", "100");
      const res = await fetch(`${BASE}/api/prospects?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: reviewQueue = [], isLoading: reviewLoading } = useQuery<Prospect[]>({
    queryKey: ["prospects-review"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/prospects/review-queue`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: stats } = useQuery<ProspectStats>({
    queryKey: ["prospects-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/prospects/stats`);
      if (!res.ok) return { total: 0, statusCounts: {} };
      return res.json();
    },
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ["prospects-funnel"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/prospects/funnel`);
      if (!res.ok) return { stages: [], avgDaysToConversion: null };
      return res.json();
    },
    enabled: tab === "funnel",
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}/api/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospects-review"] });
      queryClient.invalidateQueries({ queryKey: ["prospects-stats"] });
      queryClient.invalidateQueries({ queryKey: ["prospects-funnel"] });
    },
  });

  const handleApprove = (id: number) => {
    updateMutation.mutate({ id, updates: { status: "enriched" } });
  };

  const handleReject = (id: number) => {
    updateMutation.mutate({ id, updates: { status: "rejected" } });
  };

  const openEdit = (prospect: Prospect) => {
    setEditingProspect(prospect);
    setEditForm({
      phone: prospect.phone || "",
      email: prospect.email || "",
      domain: prospect.domain || "",
      companyName: prospect.companyName,
    });
  };

  const saveEdit = () => {
    if (!editingProspect) return;
    const normalized = {
      companyName: editForm.companyName || undefined,
      phone: editForm.phone || null,
      email: editForm.email || null,
      domain: editForm.domain || null,
      status: "enriched" as const,
    };
    updateMutation.mutate({
      id: editingProspect.id,
      updates: normalized,
    });
    setEditingProspect(null);
  };

  const statCards = [
    { label: "Total", value: stats?.total ?? 0, icon: Users, color: "text-foreground" },
    { label: "New", value: stats?.statusCounts?.new ?? 0, icon: Search, color: "text-blue-400" },
    { label: "Enriched", value: stats?.statusCounts?.enriched ?? 0, icon: CheckCircle, color: "text-emerald-400" },
    { label: "Review", value: stats?.statusCounts?.review_needed ?? 0, icon: AlertTriangle, color: "text-amber-400" },
    { label: "Qualified", value: stats?.statusCounts?.qualified ?? 0, icon: TrendingUp, color: "text-primary" },
  ];

  const maxFunnelCount = funnelData?.stages?.[0]?.count || 1;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">Prospect Pipeline</h1>
          <p className="text-muted-foreground">Discover, enrich, and qualify business prospects. Managed by the CMO bot.</p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {statCards.map((stat) => (
            <Card key={stat.label} className="glass-panel border-border/40">
              <CardContent className="p-4 flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
            <button
              onClick={() => setTab("pipeline")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "pipeline" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setTab("review")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === "review" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Review Queue
              {(stats?.statusCounts?.review_needed ?? 0) > 0 && (
                <span className="bg-amber-400/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                  {stats?.statusCounts?.review_needed}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("funnel")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === "funnel" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Funnel
            </button>
          </div>

          {tab === "pipeline" && (
            <>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="enriched">Enriched</SelectItem>
                  <SelectItem value="review_needed">Review Needed</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="responded">Responded</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {clients.length > 1 && (
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
        </div>

        {tab === "pipeline" && (
          <Card className="glass-panel border-border/40">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : prospects.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Building className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No prospects yet</p>
                  <p className="text-sm mt-1">Use the CMO bot to run a prospect search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left p-4 font-medium text-muted-foreground">Company</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Domain</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Phone</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Email</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Confidence</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Source</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospects.map((p) => (
                        <tr key={p.id} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                          <td className="p-4 font-medium">{p.companyName}</td>
                          <td className="p-4">
                            {p.domain ? (
                              <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                {p.domain}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            {p.phone ? (
                              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {p.phone}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            {p.email ? (
                              <a href={`mailto:${p.email}`} className="text-primary hover:underline flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {p.email}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceBg(p.confidenceScore)}`}>
                              <span className={confidenceColor(p.confidenceScore)}>{Math.round(p.confidenceScore * 100)}%</span>
                            </span>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className={STATUS_COLORS[p.status] || ""}>
                              {STATUS_LABELS[p.status] || p.status}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                              <Globe className="w-4 h-4" />
                            </a>
                          </td>
                          <td className="p-4 text-muted-foreground text-xs">{formatDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "review" && (
          <div className="space-y-4">
            {reviewLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : reviewQueue.length === 0 ? (
              <Card className="glass-panel border-border/40">
                <CardContent className="text-center py-16 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50 text-emerald-400" />
                  <p className="text-lg font-medium">Review queue is clear</p>
                  <p className="text-sm mt-1">All low-confidence prospects have been reviewed.</p>
                </CardContent>
              </Card>
            ) : (
              reviewQueue.map((p) => (
                <Card key={p.id} className="glass-panel border-border/40">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{p.companyName}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceBg(p.confidenceScore)}`}>
                            <span className={confidenceColor(p.confidenceScore)}>{Math.round(p.confidenceScore * 100)}%</span> confidence
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-muted-foreground" />
                            {p.domain ? (
                              <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.domain}</a>
                            ) : (
                              <span className="text-muted-foreground">No domain</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <span className={p.phone ? "text-foreground" : "text-muted-foreground"}>{p.phone || "Not found"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span className={p.email ? "text-foreground" : "text-muted-foreground"}>{p.email || "Not found"}</span>
                          </div>
                        </div>
                        {p.extractionNotes && (
                          <p className="text-xs text-muted-foreground mt-2">{p.extractionNotes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="gap-1">
                          <Edit3 className="w-3 h-3" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleApprove(p.id)} className="gap-1 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10">
                          <CheckCircle className="w-3 h-3" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(p.id)} className="gap-1 text-red-400 border-red-400/30 hover:bg-red-400/10">
                          <XCircle className="w-3 h-3" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === "funnel" && (
          <div className="space-y-6">
            {funnelLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <Card className="glass-panel border-border/40">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      Sales Funnel
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {funnelData?.stages?.map((stage, i) => (
                        <div key={stage.stage} className="flex items-center gap-4">
                          <div className="w-32 text-sm font-medium text-right shrink-0">{stage.stage}</div>
                          <div className="flex-1 flex items-center gap-3">
                            <div className="flex-1 h-10 bg-secondary/30 rounded-lg overflow-hidden relative">
                              <motion.div
                                initial={prefersReducedMotion ? false : { width: 0 }}
                                animate={{ width: `${maxFunnelCount > 0 ? (stage.count / maxFunnelCount) * 100 : 0}%` }}
                                transition={{ duration: 0.6, delay: i * 0.1 }}
                                className={`h-full ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]} rounded-lg flex items-center justify-end pr-3`}
                              >
                                <span className="text-sm font-bold text-white drop-shadow-sm">
                                  {stage.count}
                                </span>
                              </motion.div>
                            </div>
                            <div className="w-16 text-right shrink-0">
                              {i > 0 ? (
                                <span className={`text-sm font-medium ${stage.conversionRate >= 50 ? "text-emerald-400" : stage.conversionRate >= 25 ? "text-amber-400" : "text-red-400"}`}>
                                  {stage.conversionRate}%
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </div>
                          <div className="w-16 text-right shrink-0">
                            {stage.avgDays != null ? (
                              <span className="text-xs text-muted-foreground">{stage.avgDays}d avg</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                          </div>
                          {i < (funnelData?.stages?.length || 0) - 1 && (
                            <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0 hidden sm:block" />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="glass-panel border-border/40">
                    <CardContent className="p-5 flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{funnelData?.stages?.[0]?.count ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Total Discovered</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="glass-panel border-border/40">
                    <CardContent className="p-5 flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <UserCheck className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{funnelData?.stages?.[5]?.count ?? 0}</div>
                        <div className="text-xs text-muted-foreground">Total Converted</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="glass-panel border-border/40">
                    <CardContent className="p-5 flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <Calendar className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">
                          {funnelData?.avgDaysToConversion != null ? `${funnelData.avgDaysToConversion}d` : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">Avg. Days to Convert</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!editingProspect} onOpenChange={(open) => !open && setEditingProspect(null)}>
        <DialogContent className="glass-panel border-border/40">
          <DialogHeader>
            <DialogTitle>Edit Prospect</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Company Name</label>
              <Input value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Domain</label>
              <Input value={editForm.domain} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })} placeholder="example.com" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Phone</label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="contact@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProspect(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
