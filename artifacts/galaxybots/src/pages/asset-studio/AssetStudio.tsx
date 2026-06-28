import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Search,
  Loader2,
  TrendingUp,
  Rocket,
  Layers,
  DollarSign,
  Sparkles,
} from "lucide-react";
import {
  assetGet,
  assetPost,
  generateDocumentAsset,
  ASSET_TYPE_OPTIONS,
  ASSET_TYPE_LABELS,
  ASSET_STATUS_OPTIONS,
  ASSET_STATUS_LABELS,
  DOCUMENT_KIND_OPTIONS,
  DOCUMENT_KIND_LABELS,
  type Asset,
  type Portfolio,
  type DocumentKind,
} from "@/lib/asset-fetch";

const STATUS_STYLES: Record<string, string> = {
  idea: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  draft: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  in_review: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  tracking: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  archived: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function typeLabel(t: string): string {
  return ASSET_TYPE_LABELS[t] ?? t;
}

function PortfolioOverview() {
  const { data: portfolio, isLoading } = useQuery<Portfolio>({
    queryKey: ["asset-portfolio"],
    queryFn: () => assetGet<Portfolio>("/portfolio"),
  });

  if (isLoading || !portfolio) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  const { totals, byType, byStatus } = portfolio;
  const created = totals.total;

  const stats = [
    { label: "Total Assets", value: String(created), icon: Layers },
    { label: "Published / Tracking", value: String(totals.published), icon: Rocket },
    { label: "Revenue to Date", value: fmtMoney(totals.revenue), icon: DollarSign },
  ];

  const typeRows = Object.entries(byType).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> By Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {typeRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No assets yet.</p>
            )}
            {typeRows.map(([type, agg]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span>{typeLabel(type)}</span>
                <span className="text-muted-foreground">
                  {agg.count} · {fmtMoney(agg.revenue)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> By Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ASSET_STATUS_OPTIONS.map((status) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <Badge variant="outline" className={STATUS_STYLES[status]}>
                  {ASSET_STATUS_LABELS[status]}
                </Badge>
                <span className="text-muted-foreground">{byStatus[status] ?? 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateAssetDialog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("printable");
  const [niche, setNiche] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      assetPost<Asset>("", {
        title: title.trim(),
        type,
        niche: niche.trim() || undefined,
        targetPlatform: targetPlatform.trim() || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-portfolio"] });
      toast({ title: "Asset created", description: "Started at the idea stage." });
      setOpen(false);
      setTitle("");
      setNiche("");
      setTargetPlatform("");
      setDescription("");
      setType("printable");
    },
    onError: (e: Error) =>
      toast({ title: "Could not create asset", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> New Asset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. ADHD Daily Planner Pack"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {typeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Niche</label>
              <Input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. neurodivergent adults"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Target Platform</label>
              <Input
                value={targetPlatform}
                onChange={(e) => setTargetPlatform(e.target.value)}
                placeholder="e.g. Etsy, Gumroad"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it is and the problem it solves"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDocumentDialog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("printable");
  const [niche, setNiche] = useState("");
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("");
  const [notes, setNotes] = useState("");

  const generate = useMutation({
    mutationFn: () =>
      generateDocumentAsset({
        kind,
        niche: niche.trim(),
        title: title.trim() || undefined,
        audience: audience.trim() || undefined,
        targetPlatform: targetPlatform.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-portfolio"] });
      toast({
        title: "Document generated",
        description: `"${res.title}" is ready for your review.`,
      });
      setOpen(false);
      setNiche("");
      setTitle("");
      setAudience("");
      setTargetPlatform("");
      setNotes("");
      setKind("printable");
      navigate(`/asset-studio/${res.assetId}`);
    },
    onError: (e: Error) =>
      toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !generate.isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="h-4 w-4 mr-2" /> Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a Document Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Document type</label>
            <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_KIND_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {DOCUMENT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Niche / brief</label>
            <Textarea
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. ADHD daily planner for remote workers"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title (optional)</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto if blank" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Target Platform</label>
              <Input
                value={targetPlatform}
                onChange={(e) => setTargetPlatform(e.target.value)}
                placeholder="e.g. Etsy, Gumroad"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Audience (optional)</label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. neurodivergent adults"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any requirements, angle, or themes to include"
              rows={2}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The bot generates a print-ready PDF and listing copy, then files it for your review.
            Nothing is published without your approval.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => generate.mutate()} disabled={!niche.trim() || generate.isPending}>
            {generate.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["assets", search, typeFilter, statusFilter],
    queryFn: () =>
      assetGet<Asset[]>("", {
        search: search || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <CardTitle className="text-base">Portfolio</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title…"
              className="pl-8 w-44"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ASSET_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {typeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ASSET_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {ASSET_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No assets match your filters. Create one to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`/asset-studio/${a.id}`)}
                className="w-full text-left py-3 px-2 flex items-center justify-between gap-4 hover:bg-muted/50 rounded-md transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {typeLabel(a.type)}
                    {a.niche ? ` · ${a.niche}` : ""}
                    {a.botName ? ` · ${a.botName}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-muted-foreground">
                    {fmtMoney(Number(a.revenueToDate) || 0)}
                  </span>
                  <Badge variant="outline" className={STATUS_STYLES[a.status]}>
                    {ASSET_STATUS_LABELS[a.status] ?? a.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AssetStudio() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" /> Asset Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your portfolio of income-producing digital assets — created and managed by bots,
              published only with your sign-off.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <GenerateDocumentDialog />
            <CreateAssetDialog />
          </div>
        </div>

        <PortfolioOverview />
        <AssetList />
      </div>
    </AppLayout>
  );
}
