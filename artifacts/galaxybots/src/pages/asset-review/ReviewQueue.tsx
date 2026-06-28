import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  XCircle,
  PencilLine,
  Loader2,
  FileStack,
  Sparkles,
  Clock,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ASSET_TYPE_OPTIONS, type ReviewQueueItem } from "@/lib/asset-fetch";
import { useReviewQueue, useBulkReview, type QueueFilters } from "./useReviewData";
import {
  ConfidenceBadge,
  ComplianceBadge,
  confidenceColor,
  formatHours,
  eligibleSummary,
} from "./helpers";

export function ReviewQueue() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<QueueFilters>({});
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch, isFetching } = useReviewQueue({
    ...filters,
    search: search.trim() || undefined,
  });
  const bulk = useBulkReview();

  const items = useMemo(() => data?.items ?? [], [data]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Keep selection and cursor valid as the queue changes.
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set<number>();
      for (const it of items) if (prev.has(it.id)) valid.add(it.id);
      return valid;
    });
    setCursor((c) => Math.min(c, Math.max(0, items.length - 1)));
  }, [items]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function runAction(
    action: "approve" | "reject" | "revise",
    ids: number[],
  ) {
    if (ids.length === 0) return;
    try {
      const res = await bulk.mutateAsync({ ids, action });
      toast({
        title: `${action[0].toUpperCase()}${action.slice(1)}d ${res.updated.length} asset${res.updated.length === 1 ? "" : "s"}`,
        description: res.skipped.length
          ? `${res.skipped.length} skipped (no longer in review).`
          : undefined,
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  // Keyboard-fast single-asset actions. Ignored while typing in inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (items.length === 0) return;
      const current = items[cursor];
      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          setCursor((c) => Math.min(c + 1, items.length - 1));
          break;
        case "k":
          e.preventDefault();
          setCursor((c) => Math.max(c - 1, 0));
          break;
        case "x":
          e.preventDefault();
          if (current) toggle(current.id);
          break;
        case "a":
          e.preventDefault();
          if (selected.size > 0) runAction("approve", [...selected]);
          else if (current) runAction("approve", [current.id]);
          break;
        case "r":
          e.preventDefault();
          if (selected.size > 0) runAction("reject", [...selected]);
          else if (current) runAction("reject", [current.id]);
          break;
        case "e":
          e.preventDefault();
          if (selected.size > 0) runAction("revise", [...selected]);
          else if (current) runAction("revise", [current.id]);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cursor, selected]);

  useEffect(() => {
    const el = rowRefs.current.get(items[cursor]?.id);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, items]);

  const selectedIds = [...selected];
  const eligibleCount = eligibleSummary(items);

  return (
    <div className="space-y-4">
      {/* Filter / search bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 font-tech text-sm"
        />
        <Select
          value={filters.type ?? "all"}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, type: v === "all" ? undefined : v }))
          }
        >
          <SelectTrigger className="w-40 font-tech text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ASSET_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Platform…"
          value={filters.platform ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, platform: e.target.value || undefined }))
          }
          className="w-36 font-tech text-sm"
        />
        <div className="ml-auto flex items-center gap-2 text-xs font-tech text-muted-foreground">
          {isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
          <Sparkles className="w-3.5 h-3.5 text-cyan" />
          {eligibleCount} auto-publish eligible
          <Button
            size="sm"
            variant="outline"
            className="font-tech text-xs"
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Keyboard help */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-tech">
        <span className="flex items-center gap-1">
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>x</Kbd> select
        </span>
        <span className="flex items-center gap-1">
          <Kbd>a</Kbd> approve
        </span>
        <span className="flex items-center gap-1">
          <Kbd>r</Kbd> reject
        </span>
        <span className="flex items-center gap-1">
          <Kbd>e</Kbd> revise
        </span>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card/95 backdrop-blur px-4 py-2.5 shadow-lg">
          <span className="text-sm font-tech text-primary">
            {selectedIds.length} selected
          </span>
          <Button size="sm" variant="ghost" className="text-xs" onClick={selectAll}>
            Select all
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={clearSelection}>
            Clear
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              className="text-xs h-8 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
              variant="ghost"
              disabled={bulk.isPending}
              onClick={() => runAction("approve", selectedIds)}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve & publish
            </Button>
            <Button
              size="sm"
              className="text-xs h-8 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
              variant="ghost"
              disabled={bulk.isPending}
              onClick={() => runAction("revise", selectedIds)}
            >
              <PencilLine className="w-3.5 h-3.5 mr-1" /> Send for revision
            </Button>
            <Button
              size="sm"
              className="text-xs h-8 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
              variant="ghost"
              disabled={bulk.isPending}
              onClick={() => runAction("reject", selectedIds)}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
            </Button>
          </div>
        </div>
      )}

      {/* Queue */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground font-tech">
            <FileStack className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Nothing waiting for review. The queue is clear.
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <ReviewRow
                key={item.id}
                item={item}
                focused={idx === cursor}
                checked={selected.has(item.id)}
                onCheck={() => toggle(item.id)}
                onFocus={() => setCursor(idx)}
                onAction={(a) => runAction(a, [item.id])}
                busy={bulk.isPending}
                registerRef={(el) => {
                  if (el) rowRefs.current.set(item.id, el);
                  else rowRefs.current.delete(item.id);
                }}
              />
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function ReviewRow({
  item,
  focused,
  checked,
  onCheck,
  onFocus,
  onAction,
  busy,
  registerRef,
}: {
  item: ReviewQueueItem;
  focused: boolean;
  checked: boolean;
  onCheck: () => void;
  onFocus: () => void;
  onAction: (a: "approve" | "reject" | "revise") => void;
  busy: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={registerRef}
      onClick={onFocus}
      className={`rounded-xl border bg-card/60 px-4 py-3 transition-colors ${
        focused ? "border-primary/60 ring-1 ring-primary/30" : "border-border/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={checked}
          onCheckedChange={onCheck}
          onClick={(e) => e.stopPropagation()}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">{item.title}</span>
            <Badge variant="outline" className="text-[9px] uppercase font-tech">
              {item.type.replace(/_/g, " ")}
            </Badge>
            {item.targetPlatform && (
              <Badge variant="outline" className="text-[9px] font-tech text-muted-foreground">
                {item.targetPlatform}
              </Badge>
            )}
            <ConfidenceBadge score={item.confidenceScore} />
            <ComplianceBadge status={item.complianceStatus} />
            {item.autoPublishEligible && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[9px] font-tech bg-cyan/15 text-cyan border-cyan/30 gap-1">
                    <Zap className="w-3 h-3" /> auto-eligible
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{item.autonomyReason}</TooltipContent>
              </Tooltip>
            )}
            {item.slaOverdue && (
              <Badge className="text-[9px] font-tech bg-red-500/15 text-red-400 border-red-500/30 gap-1">
                <AlertTriangle className="w-3 h-3" /> SLA overdue
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
              {item.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-tech">
            {item.botName && <span>by {item.botName}</span>}
            <span className="flex items-center gap-1">
              <FileStack className="w-3 h-3" /> {item.fileCount} file
              {item.fileCount === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatHours(item.hoursInReview)} in review
            </span>
            {item.complianceIssues.length > 0 && (
              <span className="text-red-400">
                {item.complianceIssues.length} compliance issue
                {item.complianceIssues.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {/* Confidence factor breakdown */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.confidenceFactors.map((f) => (
              <Tooltip key={f.key}>
                <TooltipTrigger asChild>
                  <span
                    className={`text-[10px] font-tech rounded px-1.5 py-0.5 border ${confidenceColor(
                      Math.round((f.points / Math.max(f.max, 1)) * 100),
                    )}`}
                  >
                    {f.label}: {f.points}/{f.max}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{f.detail}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="text-xs h-7 bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
            onClick={(e) => {
              e.stopPropagation();
              onAction("approve");
            }}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="text-xs h-7 bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
            onClick={(e) => {
              e.stopPropagation();
              onAction("revise");
            }}
          >
            <PencilLine className="w-3 h-3 mr-1" /> Revise
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="text-xs h-7 bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
            onClick={(e) => {
              e.stopPropagation();
              onAction("reject");
            }}
          >
            <XCircle className="w-3 h-3 mr-1" /> Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
