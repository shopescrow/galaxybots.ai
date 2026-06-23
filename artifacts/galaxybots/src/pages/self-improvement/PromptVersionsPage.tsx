import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  Loader2,
  Brain,
  CheckCircle2,
  RefreshCw,
  XCircle,
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PromptVersion = {
  id: number;
  botId: number;
  botName: string | null;
  versionNum: number;
  diffFromPrev: string | null;
  evidenceSummary: string | null;
  triggeredBy: string;
  activatedAt: string | null;
  shadowPeriodEnd: string | null;
  outcomeScoreBefore: number | null;
  outcomeScoreAfter: number | null;
  diffMagnitudePct: number | null;
  status: string;
  rollbackReason: string | null;
  createdAt: string;
};

const STATUS_ICON: Record<string, React.ElementType> = {
  active: CheckCircle2,
  shadow: RefreshCw,
  pending_review: AlertTriangle,
  rolled_back: XCircle,
  archived: Archive,
  rejected: XCircle,
};
const STATUS_COLOR: Record<string, string> = {
  active: "text-green-500",
  shadow: "text-blue-500",
  pending_review: "text-yellow-500",
  rolled_back: "text-red-500",
  archived: "text-muted-foreground",
  rejected: "text-red-400",
};

function VersionCard({ version, onReview }: { version: PromptVersion; onReview: (id: number, action: "approve" | "reject") => void }) {
  const Icon = STATUS_ICON[version.status] ?? RefreshCw;
  const color = STATUS_COLOR[version.status] ?? "text-muted-foreground";
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {version.botName ?? `Bot #${version.botId}`}
                </span>
                <Badge variant="outline" className="text-[10px] font-tech">
                  v{version.versionNum}
                </Badge>
                <span className={`text-xs font-tech ${color}`}>{version.status}</span>
              </div>
              {version.diffMagnitudePct != null && (
                <span className="text-xs text-muted-foreground">
                  {(version.diffMagnitudePct * 100).toFixed(1)}% diff
                </span>
              )}
            </div>

            {version.evidenceSummary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {version.evidenceSummary}
              </p>
            )}

            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              {version.outcomeScoreBefore != null && (
                <span>Before: {(version.outcomeScoreBefore * 100).toFixed(0)}%</span>
              )}
              {version.outcomeScoreAfter != null && (
                <span>After: {(version.outcomeScoreAfter * 100).toFixed(0)}%</span>
              )}
              {version.shadowPeriodEnd && (
                <span>Shadow until: {new Date(version.shadowPeriodEnd).toLocaleDateString()}</span>
              )}
            </div>

            {version.rollbackReason && (
              <p className="text-xs text-red-500 mt-1">{version.rollbackReason}</p>
            )}

            {version.diffFromPrev && (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {expanded ? "Hide diff" : "Show diff"}
              </button>
            )}
            {expanded && version.diffFromPrev && (
              <pre className="mt-2 text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap border border-border/30 max-h-40">
                {version.diffFromPrev}
              </pre>
            )}

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                {new Date(version.createdAt).toLocaleDateString()} · by {version.triggeredBy}
              </span>
              {version.status === "pending_review" && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
                    onClick={() => onReview(version.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => onReview(version.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PromptVersionsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const versions = useQuery<PromptVersion[]>({
    queryKey: ["self-improvement", "prompt-versions", statusFilter],
    queryFn: async () => {
      const url =
        statusFilter === "all"
          ? `${BASE}/api/self-improvement/prompt-versions`
          : `${BASE}/api/self-improvement/prompt-versions?status=${statusFilter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await fetch(`${BASE}/api/self-improvement/prompt-versions/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["self-improvement", "prompt-versions"] }),
  });

  const counts: Record<string, number> = { all: versions.data?.length ?? 0 };
  for (const v of versions.data ?? []) {
    counts[v.status] = (counts[v.status] ?? 0) + 1;
  }

  const filters = ["all", "pending_review", "shadow", "active", "rolled_back", "rejected"];

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <Brain className="w-3 h-3 mr-1" />
                Prompt Evolution
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Prompt <span className="text-gradient">Versions</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Review and manage auto-evolved system prompt updates
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "all" ? "All" : f.replace("_", " ")} ({counts[f] ?? 0})
            </button>
          ))}
        </div>

        {versions.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (versions.data?.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No prompt versions yet. Evolution runs weekly when low-scoring sessions accumulate.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(versions.data ?? []).map((v) => (
              <ErrorBoundary key={v.id}>
                <VersionCard
                  version={v}
                  onReview={(id, act) => review.mutate({ id, action: act })}
                />
              </ErrorBoundary>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
