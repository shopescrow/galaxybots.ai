import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  Download,
  Upload,
  DollarSign,
  CheckCircle2,
  ShieldCheck,
  Store,
  FileText,
  History,
  Plus,
  Tag,
  Copy,
} from "lucide-react";
import {
  assetGet,
  assetPost,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  type AssetDetail as AssetDetailType,
} from "@/lib/asset-fetch";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_PREFIX = `${BASE}/api/assets`;

const STATUS_STYLES: Record<string, string> = {
  idea: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  draft: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  in_review: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  tracking: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  archived: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30",
};

// Mirrors ALLOWED_TRANSITIONS in the api-server assets route.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  idea: ["draft", "archived"],
  draft: ["in_review", "archived"],
  in_review: ["published", "draft", "archived"],
  published: ["tracking", "archived"],
  tracking: ["published", "archived"],
  archived: ["draft"],
};

function fmtMoney(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function authToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
}

function StatusActions({ asset }: { asset: AssetDetailType }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const allowed = ALLOWED_TRANSITIONS[asset.status] ?? [];

  const transition = useMutation({
    mutationFn: (vars: { status: string; approve?: boolean }) =>
      assetPost(`/${asset.id}/status`, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", asset.id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-portfolio"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) =>
      toast({ title: "Transition blocked", description: e.message, variant: "destructive" }),
  });

  if (allowed.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((next) => {
        if (next === "published") {
          return (
            <Button
              key={next}
              size="sm"
              onClick={() => transition.mutate({ status: "published", approve: true })}
              disabled={transition.isPending}
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Approve &amp; Publish
            </Button>
          );
        }
        return (
          <Button
            key={next}
            size="sm"
            variant="outline"
            onClick={() => transition.mutate({ status: next })}
            disabled={transition.isPending}
          >
            Move to {ASSET_STATUS_LABELS[next] ?? next}
          </Button>
        );
      })}
    </div>
  );
}

interface ListingCopyShape {
  title?: string;
  tags?: string[];
  description?: string;
  suggestedPriceUsd?: number;
}

function ListingCopyCard({ asset }: { asset: AssetDetailType }) {
  const { toast } = useToast();
  const listing = (asset.metadata?.["listingCopy"] ?? null) as ListingCopyShape | null;
  if (!listing) return null;

  const copyText = [
    listing.title ? `Title: ${listing.title}` : "",
    listing.tags && listing.tags.length ? `Tags: ${listing.tags.join(", ")}` : "",
    listing.description ? `\n${listing.description}` : "",
    typeof listing.suggestedPriceUsd === "number"
      ? `\nSuggested price: ${fmtMoney(listing.suggestedPriceUsd)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Tag className="h-4 w-4" /> Listing Copy
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(copyText);
            toast({ title: "Listing copy copied" });
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {listing.title && (
          <div>
            <div className="text-xs text-muted-foreground">Title</div>
            <div className="font-medium">{listing.title}</div>
          </div>
        )}
        {listing.tags && listing.tags.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {listing.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {listing.description && (
          <div>
            <div className="text-xs text-muted-foreground">Description</div>
            <p className="whitespace-pre-wrap">{listing.description}</p>
          </div>
        )}
        {typeof listing.suggestedPriceUsd === "number" && listing.suggestedPriceUsd > 0 && (
          <div>
            <div className="text-xs text-muted-foreground">Suggested price</div>
            <div className="font-medium">{fmtMoney(listing.suggestedPriceUsd)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FileUploader({ assetId }: { assetId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { uploadURL } = await assetPost<{ uploadURL: string }>("/upload-url", {});
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const kind =
        ext === "pdf"
          ? "pdf"
          : ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
            ? "image"
            : ["mp3", "wav", "ogg", "m4a"].includes(ext)
              ? "audio"
              : ["mp4", "mov", "webm", "avi"].includes(ext)
                ? "video"
                : ["csv", "json", "xlsx", "parquet"].includes(ext)
                  ? "dataset"
                  : ["zip", "tar", "gz", "7z"].includes(ext)
                    ? "archive"
                    : "other";

      await assetPost(`/${assetId}/files`, {
        fileName: file.name,
        objectPath: uploadURL.split("?")[0],
        kind,
        contentType: file.type || undefined,
        sizeBytes: file.size,
      });
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      toast({ title: "File attached", description: file.name });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-1.5" />
        )}
        Upload file
      </Button>
    </>
  );
}

function RevenueDialogInline({ assetId }: { assetId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");

  const log = useMutation({
    mutationFn: () =>
      assetPost(`/${assetId}/revenue`, { source: source.trim(), amount: Number(amount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      queryClient.invalidateQueries({ queryKey: ["asset-portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Revenue logged" });
      setSource("");
      setAmount("");
    },
    onError: (e: Error) =>
      toast({ title: "Could not log revenue", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Source</label>
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Gumroad sale"
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Amount</label>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          type="number"
          className="w-28"
        />
      </div>
      <Button
        size="sm"
        onClick={() => log.mutate()}
        disabled={!source.trim() || !amount || log.isPending}
      >
        {log.isPending ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-1.5" />
        )}
        Log
      </Button>
    </div>
  );
}

function ListingDialogInline({ assetId }: { assetId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [platform, setPlatform] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [price, setPrice] = useState("");

  const add = useMutation({
    mutationFn: () =>
      assetPost(`/${assetId}/listings`, {
        platform: platform.trim(),
        externalUrl: externalUrl.trim() || undefined,
        price: price ? Number(price) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      toast({ title: "Listing added" });
      setPlatform("");
      setExternalUrl("");
      setPrice("");
    },
    onError: (e: Error) =>
      toast({ title: "Could not add listing", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Platform</label>
        <Input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="Etsy"
          className="w-32"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">URL</label>
        <Input
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://…"
          className="w-48"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Price</label>
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
          type="number"
          className="w-24"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => add.mutate()}
        disabled={!platform.trim() || add.isPending}
      >
        {add.isPending ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-1.5" />
        )}
        Add
      </Button>
    </div>
  );
}

export default function AssetDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/asset-studio/:id");
  const id = params?.id ? parseInt(params.id) : NaN;

  const { data: asset, isLoading } = useQuery<AssetDetailType>({
    queryKey: ["asset", id],
    queryFn: () => assetGet<AssetDetailType>(`/${id}`),
    enabled: !isNaN(id),
  });

  if (isLoading || !asset) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const history = [...(asset.statusHistory ?? [])].reverse();

  return (
    <AppLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-5xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/asset-studio")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Studio
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{asset.title}</h1>
              <Badge variant="outline" className={STATUS_STYLES[asset.status]}>
                {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {ASSET_TYPE_LABELS[asset.type] ?? asset.type}
              {asset.niche ? ` · ${asset.niche}` : ""}
              {asset.targetPlatform ? ` · ${asset.targetPlatform}` : ""}
            </p>
            {asset.description && (
              <p className="text-sm mt-2 max-w-2xl">{asset.description}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold">
              {fmtMoney(Number(asset.revenueToDate) || 0)}
            </div>
            <div className="text-xs text-muted-foreground">Revenue to date</div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Lifecycle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusActions asset={asset} />
            {asset.status === "in_review" && (
              <p className="text-xs text-muted-foreground mt-3">
                Publishing requires your explicit approval. Use “Approve &amp; Publish” to sign off.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ListingCopyCard asset={asset} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Files
              </CardTitle>
              <FileUploader assetId={asset.id} />
            </CardHeader>
            <CardContent className="space-y-2">
              {asset.files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No files attached yet.</p>
              ) : (
                asset.files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 text-sm border-b border-border pb-2 last:border-0"
                  >
                    <span className="truncate">{f.fileName}</span>
                    <button
                      type="button"
                      onClick={() => downloadFile(asset.id, f.id, f.fileName)}
                      className="text-primary hover:underline flex items-center gap-1 shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4" /> Status Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              ) : (
                history.map((h, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div>
                      <div className="font-medium">
                        {ASSET_STATUS_LABELS[h.status] ?? h.status}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(h.at).toLocaleString()} · {h.changedBy}
                        {h.note ? ` · ${h.note}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4" /> Listings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {asset.listings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No listings yet.</p>
              ) : (
                asset.listings.map((l) => (
                  <div key={l.id} className="text-sm border-b border-border pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{l.platform}</span>
                      <Badge variant="outline">{l.listingStatus}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.price ? fmtMoney(Number(l.price), l.currency) : "—"}
                      {l.externalUrl && (
                        <>
                          {" · "}
                          <a
                            href={l.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            View listing
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              <ListingDialogInline assetId={asset.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {asset.revenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No revenue logged yet.</p>
              ) : (
                asset.revenue.slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0"
                  >
                    <div>
                      <div>{r.source}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.occurredAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="font-medium">
                      {fmtMoney(Number(r.amount) || 0, r.currency)}
                    </span>
                  </div>
                ))
              )}
              <RevenueDialogInline assetId={asset.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

async function downloadFile(assetId: number, fileId: number, fileName: string) {
  const token = authToken();
  const res = await fetch(`${API_PREFIX}/${assetId}/files/${fileId}/download`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
