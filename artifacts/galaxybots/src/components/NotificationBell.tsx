import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, ExternalLink, Check, CheckCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";

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

const CATEGORY_LABELS: Record<string, string> = {
  prospect: "Prospects",
  aeo: "AEO",
  competitor: "Competitor",
  cost: "Cost",
  bot: "Bot",
  pipeline: "Pipeline",
  system: "System",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: countData } = useQuery<{ unread: number }>({
    queryKey: ["notification-count"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/notifications/count`, {
        credentials: "include",
      });
      if (!res.ok) return { unread: 0 };
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery<NotificationItem[]>({
    queryKey: ["notifications-dropdown"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/notifications?limit=10&includeRead=true`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-dropdown"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
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
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-dropdown"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    const eventSource = new EventSource(`${BASE}/api/events/background`);
    eventSource.addEventListener("notification", (e) => {
      try {
        const data = JSON.parse(e.data);
        queryClient.invalidateQueries({ queryKey: ["notification-count"] });
        if (open) {
          queryClient.invalidateQueries({ queryKey: ["notifications-dropdown"] });
        }
        if (data.severity === "critical" && "Notification" in window && Notification.permission === "granted") {
          new Notification(data.title, { body: data.body });
        }
      } catch (_) {}
    });
    return () => eventSource.close();
  }, [open, queryClient]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handleNotificationClick = useCallback((notification: NotificationItem) => {
    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
    setOpen(false);
  }, [markReadMutation, navigate]);

  const unreadCount = countData?.unread ?? 0;

  const grouped = (notifications ?? []).reduce<Record<string, NotificationItem[]>>((acc, n) => {
    const cat = n.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(n);
    return acc;
  }, {});

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-y-auto rounded-xl border border-border/40 bg-background shadow-2xl z-[100]">
          <div className="sticky top-0 bg-background border-b border-border/40 p-3 flex items-center justify-between z-10">
            <span className="font-display font-bold text-sm">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 gap-1"
                  onClick={() => markAllReadMutation.mutate()}
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </Button>
              )}
            </div>
          </div>

          {(!notifications || notifications.length === 0) ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-[10px] font-tech uppercase tracking-wider text-muted-foreground bg-secondary/30">
                    {CATEGORY_LABELS[category] || category}
                  </div>
                  {items.map((n) => (
                    <button
                      key={n.id}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-secondary/40 transition-colors flex gap-2.5 items-start",
                        !n.readAt && "bg-primary/5"
                      )}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <span className="text-sm mt-0.5 flex-shrink-0">
                        {SEVERITY_ICONS[n.severity] || SEVERITY_ICONS.info}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-sm leading-snug", !n.readAt ? "font-bold" : "font-medium")}>
                          {n.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                          {n.link && <ExternalLink className="w-3 h-3 inline" />}
                        </div>
                      </div>
                      {!n.readAt && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="sticky bottom-0 bg-background border-t border-border/40 p-2 text-center">
            <Link
              href="/notifications"
              className="text-xs font-tech text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
