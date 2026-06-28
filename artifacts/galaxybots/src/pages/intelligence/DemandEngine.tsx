import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useToast } from "@/hooks/use-toast";
import {
  Radar,
  TrendingUp,
  Swords,
  Sparkles,
  Loader2,
  Check,
  X,
  Pin,
  PinOff,
  RotateCcw,
  Package,
  Search,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${BASE}/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

interface DemandEvidence {
  searchSignals: string[];
  trendSignals: string[];
  competitorExamples: string[];
  sources: string[];
}

interface Opportunity {
  id: number;
  category: string;
  niche: string;
  title: string;
  suggestedAngle: string;
  suggestedAssetType: string | null;
  demandScore: number;
  competitionScore: number;
  opportunityScore: number;
  rank: number | null;
  pinned: boolean;
  status: string;
  resultingAssetId: number | null;
  evidence: DemandEvidence | null;
}

interface OpportunitiesResponse {
  opportunities: Opportunity[];
  categories: string[];
}

interface ProducedLink {
  opportunityId: number;
  title: string;
  niche: string;
  category: string;
  opportunityScore: number;
  asset: { id: number; title: string; type: string; status: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  queued: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  rejected: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  produced: "bg-violet-500/15 text-violet-500 border-violet-500/30",
};

function ScoreBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1 text-muted-foreground">{icon}{label}</span>
        <span className="font-medium text-foreground">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: DemandEvidence | null }) {
  if (!evidence) return null;
  const sections: { label: string; items: string[] }[] = [
    { label: "Search signals", items: evidence.searchSignals ?? [] },
    { label: "Trend signals", items: evidence.trendSignals ?? [] },
    { label: "Competitors", items: evidence.competitorExamples ?? [] },
    { label: "Sources", items: evidence.sources ?? [] },
  ].filter((s) => s.items.length > 0);
  if (sections.length === 0) return <p className="text-xs text-muted-foreground">No evidence recorded.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      {sections.map((s) => (
        <div key={s.label}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{s.label}</p>
          <ul className="space-y-1">
            {s.items.slice(0, 4).map((item, i) => (
              <li key={i} className="text-xs text-foreground/80 leading-snug">• {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OpportunityCard({
  opp,
  onReview,
  busy,
}: {
  opp: Opportunity;
  onReview: (id: number, action: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {opp.rank != null && (
                <span className="text-xs font-mono text-muted-foreground">#{opp.rank}</span>
              )}
              <h3 className="font-display font-semibold text-foreground truncate">{opp.title}</h3>
              {opp.pinned && <Pin className="w-3.5 h-3.5 text-primary" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {opp.category} · {opp.niche}
              {opp.suggestedAssetType ? ` · ${opp.suggestedAssetType}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={STATUS_STYLES[opp.status] ?? ""}>{opp.status}</Badge>
            <div className="text-right">
              <div className="text-lg font-bold text-foreground leading-none">{Math.round(opp.opportunityScore)}</div>
              <div className="text-[10px] text-muted-foreground">opportunity</div>
            </div>
          </div>
        </div>

        <p className="text-sm text-foreground/80 mt-3">{opp.suggestedAngle}</p>

        <div className="flex gap-4 mt-3">
          <ScoreBar label="Demand" value={opp.demandScore} color="bg-emerald-500" icon={<TrendingUp className="w-3 h-3" />} />
          <ScoreBar label="Competition" value={opp.competitionScore} color="bg-rose-500" icon={<Swords className="w-3 h-3" />} />
        </div>

        {open && <EvidenceList evidence={opp.evidence} />}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide evidence" : "Show evidence"}
          </Button>
          <div className="flex-1" />
          {opp.status !== "approved" && opp.status !== "produced" && (
            <Button size="sm" className="h-7 px-2 text-xs gap-1" disabled={busy} onClick={() => onReview(opp.id, "approve")}>
              <Check className="w-3.5 h-3.5" /> Approve
            </Button>
          )}
          {opp.status !== "rejected" && opp.status !== "produced" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={busy} onClick={() => onReview(opp.id, "reject")}>
              <X className="w-3.5 h-3.5" /> Reject
            </Button>
          )}
          {opp.status === "rejected" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" disabled={busy} onClick={() => onReview(opp.id, "requeue")}>
              <RotateCcw className="w-3.5 h-3.5" /> Requeue
            </Button>
          )}
          {opp.status !== "produced" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1"
              disabled={busy}
              onClick={() => onReview(opp.id, opp.pinned ? "unpin" : "pin")}
            >
              {opp.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {opp.pinned ? "Unpin" : "Pin"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DemandEngine() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isLoading } = useQuery<OpportunitiesResponse>({
    queryKey: ["demand-opportunities", statusFilter],
    queryFn: () =>
      apiFetch<OpportunitiesResponse>(
        `intelligence/demand/opportunities${statusFilter ? `?status=${statusFilter}` : ""}`,
      ),
  });

  const { data: produced } = useQuery<{ links: ProducedLink[] }>({
    queryKey: ["demand-produced"],
    queryFn: () => apiFetch<{ links: ProducedLink[] }>("intelligence/demand/produced-assets"),
  });

  const research = useMutation({
    mutationFn: (cat: string) =>
      apiFetch("intelligence/demand/research", {
        method: "POST",
        body: JSON.stringify({ category: cat }),
      }),
    onSuccess: (res: any) => {
      toast({ title: "Research complete", description: `${res.created ?? 0} opportunities surfaced for "${res.category}".` });
      setCategory("");
      qc.invalidateQueries({ queryKey: ["demand-opportunities"] });
    },
    onError: (e: Error) => toast({ title: "Research failed", description: e.message, variant: "destructive" }),
  });

  const review = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiFetch(`intelligence/demand/opportunities/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demand-opportunities"] });
    },
    onError: (e: Error) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  const opportunities = data?.opportunities ?? [];
  const filters = ["", "pending", "approved", "rejected", "produced"];

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Radar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Demand Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Research demand vs. competition and feed the creator bots a prioritized creation queue.
            </p>
          </div>
        </div>

        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Research a category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (category.trim()) research.mutate(category.trim());
              }}
            >
              <Input
                placeholder="e.g. budget planners, AI productivity tools, kids' coding kits"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={research.isPending}
              />
              <Button type="submit" disabled={research.isPending || !category.trim()} className="gap-1 shrink-0">
                {research.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Research
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          {filters.map((f) => (
            <Button
              key={f || "all"}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              className="h-7 px-3 text-xs capitalize"
              onClick={() => setStatusFilter(f)}
            >
              {f || "all"}
            </Button>
          ))}
        </div>

        <ErrorBoundary>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading opportunities…
            </div>
          ) : opportunities.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Radar className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No opportunities yet</p>
                <p className="text-sm">Research a category above to populate the creation queue.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {opportunities.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opp={opp}
                  busy={review.isPending}
                  onReview={(id, action) => review.mutate({ id, action })}
                />
              ))}
            </div>
          )}
        </ErrorBoundary>

        {produced && produced.links.length > 0 && (
          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Package className="w-4 h-4 text-violet-500" /> Produced assets
              </CardTitle>
              <p className="text-xs text-muted-foreground">Assets traced back to the opportunity that drove them.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {produced.links.map((link) => (
                <div key={link.opportunityId} className="flex items-center justify-between gap-3 text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="text-foreground font-medium truncate">{link.asset?.title ?? "Asset"}</span>
                    <span className="text-muted-foreground"> ← {link.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{link.category}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
