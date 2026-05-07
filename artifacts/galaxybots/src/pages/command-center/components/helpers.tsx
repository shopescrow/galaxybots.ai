import { formatDistanceToNow } from "date-fns";
import { Activity, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus, Shield, Eye, Lock } from "lucide-react";

export function formatTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatToolName(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export const SEVERITY_ICON: Record<string, React.ReactNode> = {
  info: <Activity className="w-3.5 h-3.5 text-blue-400" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  critical: <XCircle className="w-3.5 h-3.5 text-red-400" />,
};

export function getSlaUrgency(
  slaDeadline: string | null | undefined,
  createdAt: string,
  isTimeSensitive?: boolean | null,
): { color: string; label: string; pct: number } {
  if (!slaDeadline) return { color: "text-green-400", label: "", pct: 100 };
  const now = Date.now();
  const deadline = new Date(slaDeadline).getTime();
  const created = new Date(createdAt).getTime();
  const remaining = deadline - now;
  if (remaining <= 0) return { color: "text-red-400", label: "SLA BREACHED", pct: 0 };
  const totalWindow = deadline - created;
  const windowMs = totalWindow > 0 ? totalWindow : (isTimeSensitive ? 60 : 240) * 60 * 1000;
  const pct = Math.max(0, Math.min(100, (remaining / windowMs) * 100));
  const mins = Math.round(remaining / 60000);
  if (mins < 30) return { color: "text-red-400", label: `${mins}m left`, pct };
  if (mins < 120) return { color: "text-amber-400", label: `${mins}m left`, pct };
  const hours = Math.round(mins / 60);
  return { color: "text-green-400", label: `${hours}h left`, pct };
}

export const HEALTH_TAG_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  healthy: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "HEALTHY" },
  at_risk: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30", label: "AT RISK" },
  critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "CRITICAL" },
};

export function HealthTrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="w-3 h-3 text-green-400" />;
  if (trend === "declining") return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

export const GOVERNANCE_MODE_STYLES: Record<string, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  approval_all: {
    label: "APPROVAL ALL",
    className: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    Icon: Lock,
  },
  exception_only: {
    label: "EXCEPTION ONLY",
    className: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    Icon: Shield,
  },
  observe_only: {
    label: "OBSERVE ONLY",
    className: "text-green-400 border-green-500/30 bg-green-500/10",
    Icon: Eye,
  },
};
