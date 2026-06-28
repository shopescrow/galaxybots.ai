import { Badge } from "@/components/ui/badge";
import type {
  AssetComplianceStatus,
  ReviewQueueItem,
} from "@/lib/asset-fetch";

export function confidenceColor(score: number): string {
  if (score >= 85) return "text-green-400 border-green-500/30 bg-green-500/10";
  if (score >= 60) return "text-cyan border-cyan/30 bg-cyan/10";
  if (score >= 40)
    return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  return "text-red-400 border-red-500/30 bg-red-500/10";
}

export function ConfidenceBadge({ score }: { score: number }) {
  return (
    <Badge
      variant="outline"
      className={`font-tech text-xs tabular-nums ${confidenceColor(score)}`}
    >
      {score}% conf
    </Badge>
  );
}

const COMPLIANCE_STYLES: Record<AssetComplianceStatus, string> = {
  pass: "text-green-400 border-green-500/30 bg-green-500/10",
  fail: "text-red-400 border-red-500/30 bg-red-500/10",
  review: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  pending: "text-muted-foreground border-border/50 bg-muted/20",
};

export function ComplianceBadge({
  status,
}: {
  status: AssetComplianceStatus;
}) {
  return (
    <Badge
      variant="outline"
      className={`font-tech text-[10px] uppercase ${COMPLIANCE_STYLES[status]}`}
    >
      {status}
    </Badge>
  );
}

export function formatHours(h: number): string {
  if (h < 1) return "<1h";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function eligibleSummary(items: ReviewQueueItem[]): number {
  return items.filter((i) => i.autoPublishEligible).length;
}
