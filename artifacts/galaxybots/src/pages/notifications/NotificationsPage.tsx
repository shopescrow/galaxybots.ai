import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCheck, ExternalLink, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_SIZE = 20;

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

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "prospect", label: "Prospects" },
  { value: "aeo", label: "AEO" },
  { value: "competitor", label: "Competitor" },
  { value: "cost", label: "Cost" },
  { value: "bot", label: "Bot" },
  { value: "pipeline", label: "Pipeline" },
  { value: "system", label: "System" },
];

const SEVERITIES = [
  { value: "", label: "All" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

export default function NotificationsPage() {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(page * PAGE_SIZE));
  params.set("includeRead", "true");
  if (category) params.set("category", category);
  if (severity) params.set("severity", severity);

  const { data: notifications, isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications-page", page, category, severity],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/notifications?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
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
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-dropdown"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });

  const handleClick = (n: NotificationItem) => {
    if (!n.readAt) {
      markReadMutation.mutate(n.id);
    }
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-display font-bold">Notifications</h1>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 font-tech text-xs"
            onClick={() => markAllReadMutation.mutate()}
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <div className="flex items-center gap-1">
            <span className="text-xs font-tech text-muted-foreground mr-1">Category:</span>
            {CATEGORIES.map((c) => (
              <Button
                key={c.value}
                variant={category === c.value ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 px-2 font-tech"
                onClick={() => { setCategory(c.value); setPage(0); }}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-tech text-muted-foreground mr-1">Severity:</span>
            {SEVERITIES.map((s) => (
              <Button
                key={s.value}
                variant={severity === s.value ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7 px-2 font-tech"
                onClick={() => { setSeverity(s.value); setPage(0); }}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">Loading...</div>
        ) : !notifications || notifications.length === 0 ? (
          <Card className="border-dashed border-border/50 bg-transparent shadow-none">
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No notifications found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={cn(
                  "transition-colors cursor-pointer hover:bg-secondary/30",
                  !n.readAt && "border-primary/30 bg-primary/5"
                )}
              >
                <CardContent className="p-4 flex items-start gap-3" onClick={() => handleClick(n)}>
                  <span className="text-lg mt-0.5 flex-shrink-0">
                    {SEVERITY_ICONS[n.severity] || SEVERITY_ICONS.info}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm", !n.readAt ? "font-bold" : "font-medium")}>{n.title}</span>
                      <span className="text-[10px] font-tech px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase">
                        {n.category}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</p>
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
                      <span>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                      {n.link && (
                        <span className="flex items-center gap-0.5 text-primary">
                          <ExternalLink className="w-3 h-3" />
                          {n.link}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.readAt && (
                      <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(n.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="text-xs font-tech text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!notifications || notifications.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
