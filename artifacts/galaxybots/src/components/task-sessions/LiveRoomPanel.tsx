import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Send,
  ChevronRight,
  ChevronLeft,
  UserCircle2,
  Bot,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SSE_ENDPOINT = `${BASE}/api/events/background`;

interface Participant {
  id: number;
  displayName: string;
  role: "observer" | "participant";
  joinedAt: string;
}

interface LiveMessage {
  id: number;
  content: string;
  senderName?: string | null;
  botName?: string | null;
  senderRole?: string;
  createdAt: string;
  isHuman?: boolean;
}

interface LiveRoomPanelProps {
  sessionId: number;
  sessionStatus: string;
  sessionMessages: Array<{ id: number; content: string; botName?: string | null; senderRole?: string; createdAt: string }>;
}

export function LiveRoomPanel({ sessionId, sessionStatus, sessionMessages }: LiveRoomPanelProps) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [myRole, setMyRole] = useState<"observer" | "participant">("observer");
  const [joined, setJoined] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const join = useCallback(async (role: "observer" | "participant") => {
    try {
      const res = await fetch(`${BASE}/api/task-sessions/${sessionId}/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ role, displayName: user?.email?.split("@")[0] ?? "Team Member" }),
      });
      if (res.ok) {
        const data = await res.json();
        setMyRole(role);
        setJoined(true);
        setParticipants(data.participants ?? []);
      }
    } catch {
      /* non-fatal */
    }
  }, [sessionId, authHeaders, user]);

  const leave = useCallback(async () => {
    try {
      await fetch(`${BASE}/api/task-sessions/${sessionId}/leave`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      /* non-fatal */
    }
  }, [sessionId, authHeaders]);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/task-sessions/${sessionId}/participants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setParticipants(data);
      }
    } catch {
      /* non-fatal */
    }
  }, [sessionId, token]);

  useEffect(() => {
    join("observer");
    return () => {
      leave();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  useEffect(() => {
    if (!joined) return;
    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch(`${BASE}/api/task-sessions/${sessionId}/heartbeat`, {
          method: "POST",
          headers: authHeaders(),
        });
      } catch {
        /* non-fatal */
      }
    }, 20000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [joined, sessionId, authHeaders]);

  useEffect(() => {
    if (esRef.current) return;

    const es = new EventSource(SSE_ENDPOINT);
    esRef.current = es;

    es.addEventListener("room:joined", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.sessionId !== sessionId) return;
        fetchParticipants();
      } catch {/* noop */}
    });

    es.addEventListener("room:left", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.sessionId !== sessionId) return;
        setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
      } catch {/* noop */}
    });

    es.addEventListener("room:human_message", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.sessionId !== sessionId) return;
        const msg = data.message;
        setLiveMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { id: msg.id, content: msg.content, senderName: msg.senderName, isHuman: true, createdAt: msg.createdAt }];
        });
      } catch {/* noop */}
    });

    es.addEventListener("room:agent_reply", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.sessionId !== sessionId) return;
        const msg = data.message;
        setLiveMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { id: msg.id, content: msg.content, botName: msg.botName, isHuman: false, createdAt: msg.createdAt }];
        });
      } catch {/* noop */}
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sessionId, fetchParticipants]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [liveMessages, sessionMessages]);

  const handleBecomeParticipant = async () => {
    await leave();
    await join("participant");
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending || myRole !== "participant" || sessionStatus !== "active") return;
    const msg = inputText.trim();
    setInputText("");
    setSending(true);
    try {
      const res = await fetch(`${BASE}/api/task-sessions/${sessionId}/human-message`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: msg }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to send", description: (err as { error?: string }).error ?? "Try again", variant: "destructive" });
        setInputText(msg);
      }
    } catch {
      toast({ title: "Network error", description: "Could not send message", variant: "destructive" });
      setInputText(msg);
    } finally {
      setSending(false);
    }
  };

  const recentAgentMessages = sessionMessages
    .filter((m) => !m.senderRole || m.senderRole === "agent")
    .slice(-20);

  const allFeedMessages: LiveMessage[] = [
    ...recentAgentMessages.map((m) => ({ ...m, isHuman: false, senderName: m.botName })),
    ...liveMessages,
  ]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .filter((msg, idx, arr) => arr.findIndex((m) => m.id === msg.id && m.isHuman === msg.isHuman) === idx)
    .slice(-30);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-10 border-l border-primary/20 bg-black/30 py-4 gap-3 flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-muted-foreground hover:text-primary transition-colors"
          title="Expand Live Room"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="relative">
          <Users className="w-4 h-4 text-primary/50" />
          {participants.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 text-[7px] flex items-center justify-center text-black font-bold">
              {participants.length}
            </span>
          )}
        </div>
        <MessageSquare className="w-4 h-4 text-primary/50" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-72 border-l border-primary/20 bg-black/30 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="font-tech font-bold text-xs text-primary uppercase tracking-wider">Live Room</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Collapse"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Participants */}
      <div className="px-4 py-3 border-b border-primary/10">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="w-3 h-3 text-primary/70" />
          <span className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">
            {participants.length} watching
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {participants.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-tech border",
                  p.role === "participant"
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary/30 border-border text-muted-foreground"
                )}
                title={p.role}
              >
                <UserCircle2 className="w-2.5 h-2.5" />
                {p.displayName}
              </motion.div>
            ))}
          </AnimatePresence>
          {participants.length === 0 && (
            <span className="text-[10px] text-muted-foreground/50 font-tech">No one watching yet</span>
          )}
        </div>

        {myRole === "observer" && sessionStatus === "active" && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-6 text-[10px] font-tech border-primary/30 hover:border-primary/60 w-full"
            onClick={handleBecomeParticipant}
          >
            Join as Participant
          </Button>
        )}
        {myRole === "participant" && (
          <div className="mt-1.5 text-[9px] text-green-400 font-tech flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            You are a participant
          </div>
        )}
      </div>

      {/* Activity feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0"
        style={{ maxHeight: "calc(100% - 220px)" }}
      >
        <AnimatePresence initial={false}>
          {allFeedMessages.map((msg, i) => (
            <motion.div
              key={`${msg.isHuman ? "h" : "a"}-${msg.id}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-lg p-2 text-[11px]",
                msg.isHuman
                  ? "bg-blue-500/15 border border-blue-500/25"
                  : "bg-secondary/20 border border-primary/10"
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {msg.isHuman ? (
                  <UserCircle2 className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />
                ) : (
                  <Bot className="w-2.5 h-2.5 text-primary/60 flex-shrink-0" />
                )}
                <span className={cn("font-tech font-bold text-[9px] truncate", msg.isHuman ? "text-blue-400" : "text-primary/70")}>
                  {msg.senderName || msg.botName || "Agent"}
                </span>
                <span className="text-[8px] text-muted-foreground/40 ml-auto flex-shrink-0">
                  {format(new Date(msg.createdAt), "HH:mm")}
                </span>
              </div>
              <p className="text-muted-foreground/80 leading-snug line-clamp-3">{msg.content}</p>
            </motion.div>
          ))}
        </AnimatePresence>
        {allFeedMessages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground/30 text-xs font-tech">
            No activity yet
          </div>
        )}
      </div>

      {/* Human input */}
      {myRole === "participant" && (
        <div className="px-3 py-3 border-t border-primary/10">
          <div className="flex gap-2">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Send a message…"
              disabled={sending || sessionStatus !== "active"}
              className="text-xs font-tech bg-black/30 border-primary/20 h-8"
            />
            <Button
              size="sm"
              variant="glow"
              onClick={handleSend}
              disabled={sending || !inputText.trim() || sessionStatus !== "active"}
              className="h-8 px-2 flex-shrink-0"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </Button>
          </div>
          {sessionStatus !== "active" && (
            <p className="text-[9px] text-muted-foreground/50 font-tech mt-1">Session is not active</p>
          )}
        </div>
      )}
      {myRole === "observer" && (
        <div className="px-3 py-3 border-t border-primary/10 text-[9px] text-muted-foreground/40 font-tech text-center">
          Observer mode — join as participant to send messages
        </div>
      )}
    </div>
  );
}
