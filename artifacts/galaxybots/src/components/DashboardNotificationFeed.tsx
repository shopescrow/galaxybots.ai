import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ExternalLink, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Link, useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NotificationItem {
  id: number;
  clientId: number | null;
  userId: number | null;
  category: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const SEVERITY_ICONS: Record<string, string> = {
  critical: "\u{1F534}",
  warning: "\u{1F7E1}",
  info: "\u2139\uFE0F",
};

interface Props {
  limit?: number;
  className?: string;
}

export function DashboardNotificationFeed({ limit = 5, className }: Props) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: notifications, isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications-dashboard", limit],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/notifications?limit=${limit}&includeRead=false`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}/api/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-dropdown"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    },
  });

  const handleClick = (n: NotificationItem) => {
    if (!n.readAt) markReadMutation.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  const items = notifications ?? [];

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-display font-semibold text-primary">
          <Bell className="w-4 h-4" />
          Unread Alerts
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6 px-2 gap-1 font-tech"
            onClick={() => markAllReadMutation.mutate()}
          >
            <CheckCheck className="w-3 h-3" />
            Clear all
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground font-tech py-3 text-center">Loading...</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-xs text-muted-foreground font-tech py-3 text-center">
          No unread alerts
        </div>
      )}

      <div className="flex flex-col gap-1">
        {items.map((n) => (
          <button
            key={n.id}
            className={cn(
              "w-full text-left rounded-lg px-3 py-2 hover:bg-secondary/50 transition-colors flex gap-2.5 items-start border border-border/20",
              !n.readAt && "bg-primary/5 border-primary/20"
            )}
            onClick={() => handleClick(n)}
          >
            <span className="text-sm mt-0.5 flex-shrink-0">
              {SEVERITY_ICONS[n.severity] || SEVERITY_ICONS.info}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold leading-snug truncate">{n.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <span>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                {n.link && <ExternalLink className="w-2.5 h-2.5" />}
              </div>
            </div>
          </button>
        ))}
      </div>

      {items.length > 0 && (
        <Link
          href="/notifications"
          className="text-[11px] font-tech text-primary hover:underline mt-1 text-center"
        >
          View all notifications
        </Link>
      )}
    </div>
  );
}
