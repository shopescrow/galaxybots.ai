import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Radio,
  Users,
  Bot,
  Clock,
  ArrowRight,
  Loader2,
  MessageSquare,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SSE_ENDPOINT = `${BASE}/api/events/background`;
const ACTIVE_SESSIONS_KEY = ["active-sessions"];

interface ActiveSession {
  id: number;
  objective: string;
  status: string;
  clientId: number;
  createdAt: string;
  elapsedMinutes: number;
  participantCount: number;
  bots: Array<{ botName: string; botTitle: string }>;
  recentMessages: Array<{
    id: number;
    content: string;
    botName?: string | null;
    senderRole?: string;
    createdAt: string;
  }>;
}

function SessionCard({ session }: { session: ActiveSession }) {
  const [, navigate] = useLocation();

  const elapsed =
    session.elapsedMinutes < 60
      ? `${session.elapsedMinutes}m`
      : `${Math.floor(session.elapsedMinutes / 60)}h ${session.elapsedMinutes % 60}m`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
    >
      <Card className="p-5 bg-black/30 border-primary/20 hover:border-primary/40 transition-all">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/30 uppercase">
                  Live
                </Badge>
              </span>
              <span className="text-[10px] text-muted-foreground font-tech flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {elapsed} elapsed
              </span>
              {session.participantCount > 0 && (
                <span className="text-[10px] text-blue-400 font-tech flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {session.participantCount} watching
                </span>
              )}
            </div>
            <h3 className="font-tech font-bold text-sm text-foreground line-clamp-2">
              {session.objective}
            </h3>
          </div>
          <Button
            size="sm"
            variant="glow"
            className="flex-shrink-0 text-xs font-tech h-8 px-3"
            onClick={() => navigate(`/task-rooms/${session.id}?live=1`)}
          >
            Join Room
            <ArrowRight className="w-3 h-3 ml-1.5" />
          </Button>
        </div>

        {session.bots.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <Bot className="w-3 h-3 text-primary/50 flex-shrink-0" />
            {session.bots.slice(0, 5).map((b, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[9px] border-primary/20 text-muted-foreground px-1.5 py-0"
              >
                {b.botName}
              </Badge>
            ))}
            {session.bots.length > 5 && (
              <span className="text-[9px] text-muted-foreground/50 font-tech">
                +{session.bots.length - 5} more
              </span>
            )}
          </div>
        )}

        {session.recentMessages.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-black/30 p-2.5 border border-primary/10">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="w-3 h-3 text-primary/40" />
              <span className="text-[9px] font-tech text-muted-foreground/50 uppercase tracking-wider">
                Recent activity
              </span>
            </div>
            {session.recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-1.5">
                {msg.senderRole === "human" ? (
                  <UserCircle2 className="w-2.5 h-2.5 text-blue-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Bot className="w-2.5 h-2.5 text-primary/40 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-[9px] font-tech font-bold mr-1",
                      msg.senderRole === "human" ? "text-blue-400" : "text-primary/60"
                    )}
                  >
                    {msg.botName ?? "Agent"}:
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 line-clamp-1">
                    {msg.content}
                  </span>
                </div>
                <span className="text-[8px] text-muted-foreground/30 flex-shrink-0">
                  {format(new Date(msg.createdAt), "HH:mm")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default function LiveRooms() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  const { data: sessions = [], isLoading } = useQuery<ActiveSession[]>({
    queryKey: ACTIVE_SESSIONS_KEY,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/task-sessions/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
    enabled: !!token,
  });

  useEffect(() => {
    if (esRef.current) return;

    const es = new EventSource(SSE_ENDPOINT);
    esRef.current = es;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ACTIVE_SESSIONS_KEY });
    };

    es.addEventListener("room:joined", invalidate);
    es.addEventListener("room:left", invalidate);
    es.addEventListener("room:human_message", invalidate);
    es.addEventListener("room:agent_reply", invalidate);

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [queryClient]);

  return (
    <AppLayout>
      <div className="relative w-full min-h-[calc(100vh-5rem)] bg-background">
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <Radio className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
              {sessions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] flex items-center justify-center text-white font-bold animate-pulse">
                  {sessions.length}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary">
                Live Rooms
              </h1>
              <p className="text-muted-foreground mt-0.5 font-tech text-sm">
                All active sessions across your organization — observe or jump in.
              </p>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="flex items-center gap-2 mb-6 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-tech text-green-400">
                {sessions.length} session{sessions.length !== 1 ? "s" : ""} running live
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : sessions.length === 0 ? (
            <Card className="p-12 bg-black/30 border-primary/20 text-center mt-6">
              <Radio className="w-12 h-12 text-primary/20 mx-auto mb-4" />
              <h3 className="text-lg font-tech font-bold text-foreground mb-2">
                No Live Sessions
              </h3>
              <p className="text-sm text-muted-foreground">
                No task rooms are currently active. Start a new session from Task Rooms.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 mt-6">
              <AnimatePresence>
                {sessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
