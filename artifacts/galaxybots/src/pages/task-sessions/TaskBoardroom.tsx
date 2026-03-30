import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useTaskSession,
  useTaskSessionMessages,
  useTaskSessionAlerts,
  useExpandSession,
  useFabricateBotMutation,
} from "@/hooks/use-task-sessions";
import { useSSEStream, type AgenticEvent } from "@/hooks/use-sse";
import { ToolStepsDisplay, WorkingIndicator, MessageToolSteps } from "@/components/ToolStepCard";
import { SaveAsTemplateModal } from "@/components/SaveAsTemplate";
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getGetTaskSessionMessagesQueryKey, getGetTaskSessionAlertsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2,
  Terminal,
  Users,
  AlertTriangle,
  Send,
  Zap,
  Check,
  X,
  Target,
  Save,
  BookmarkPlus,
  Network,
  ArrowRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BotMessage {
  id: number;
  sessionId: number;
  fromBotId: number | null;
  fromBotName: string | null;
  toBotId: number | null;
  toBotName: string | null;
  taskId: string | null;
  messageType: string;
  payload: unknown;
  outcome: string | null;
  createdAt: string;
}

const MESSAGE_TYPE_STYLES: Record<string, { label: string; className: string }> = {
  assignment: { label: "ASSIGN", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  result: { label: "RESULT", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  question: { label: "QUERY", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  escalation: { label: "ESCALATE", className: "bg-red-500/20 text-red-400 border-red-500/30" },
};

function BotCommunicationsPanel({ sessionId }: { sessionId: number }) {
  const { token } = useAuth();

  const { data: botMessages = [], isLoading } = useQuery<BotMessage[]>({
    queryKey: ["bot-messages", sessionId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/task-sessions/${sessionId}/bot-messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
      </div>
    );
  }

  if (botMessages.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground/50 text-xs font-tech">
        No bot-to-bot communications yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-64">
      {botMessages.map((msg) => {
        const typeStyle = MESSAGE_TYPE_STYLES[msg.messageType] ?? { label: msg.messageType.toUpperCase(), className: "bg-secondary/50 text-muted-foreground" };
        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 p-2 rounded bg-secondary/20 border border-primary/10"
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs font-tech text-primary font-bold truncate max-w-[80px]">
                {msg.fromBotName ?? "System"}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${typeStyle.className}`}>
                {typeStyle.label}
              </Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-tech text-primary/80 truncate max-w-[80px]">
                {msg.toBotName ?? "All"}
              </span>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1.5">
              {msg.outcome && (
                <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/30">
                  {msg.outcome}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground/50">
                {format(new Date(msg.createdAt), "HH:mm:ss")}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function TaskBoardroom() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id) || 0;
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState("");
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(
    new Set(),
  );
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } =
    useTaskSession(sessionId);
  const { data: messages, isLoading: messagesLoading } =
    useTaskSessionMessages(sessionId);
  const { data: alerts } = useTaskSessionAlerts(sessionId);
  const expandSession = useExpandSession(sessionId);
  const fabricateMutation = useFabricateBotMutation();

  const onStreamComplete = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetTaskSessionMessagesQueryKey(sessionId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetTaskSessionAlertsQueryKey(sessionId),
    });
  }, [queryClient, sessionId]);

  const { isStreaming, events: streamEvents, startStream } = useSSEStream({
    onComplete: onStreamComplete,
  });

  const currentWorkingBot = streamEvents
    .filter((e) => (e.type === "tool_call" || e.type === "message") && e.botName)
    .pop()?.botName;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamEvents]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isStreaming) return;

    const messageContent = content.trim();
    setContent("");

    await startStream(`/api/task-sessions/${sessionId}/messages/stream`, {
      content: messageContent,
      senderName: "Architect",
    });
  };

  const activeAlerts =
    alerts?.filter(
      (a) => !dismissedAlerts.has(`${a.messageId}-${a.role}`),
    ) ?? [];

  const handleDismissAlert = (alert: {
    messageId: number;
    role: string;
  }) => {
    setDismissedAlerts(
      (prev) => new Set(prev).add(`${alert.messageId}-${alert.role}`),
    );
  };

  const handleApproveAlert = async (alert: {
    role: string;
    suggestedBy: string;
    messageId: number;
  }) => {
    const roleParts = alert.role.split(" - ");
    const roleTitle = roleParts[0].trim();

    try {
      const newBot = await fabricateMutation.mutateAsync({
        data: {
          name: `${roleTitle} Specialist`,
          title: roleTitle,
          department: "Cross-Functional",
          personality: `Expert ${roleTitle} with deep domain knowledge. Analytical, thorough, and collaborative.`,
          responsibilities: [
            `Provide ${roleTitle} expertise`,
            "Advise on best practices and standards",
            "Identify risks and opportunities in the domain",
          ],
          description: `AI-fabricated ${roleTitle} specialist requested during task session.`,
          category: "Cross-Functional",
        },
      });

      await expandSession.mutateAsync({
        id: sessionId,
        data: { botIds: [(newBot as { id: number }).id] },
      });

      handleDismissAlert(alert);
      toast({
        title: "Team Expanded",
        description: `${roleTitle} Specialist has been fabricated and added to the team.`,
      });
    } catch {
      toast({
        title: "Failed to expand team",
        description: "Could not add the specialist. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (sessionLoading || messagesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!session) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
          <p className="text-muted-foreground font-tech">
            Task session not found.
          </p>
        </div>
      </AppLayout>
    );
  }

  const teamBots = (session as { teamBots?: Array<{ id: number; name: string; title: string; department: string }> }).teamBots ?? [];

  return (
    <AppLayout>
      <div className="relative w-full h-[calc(100vh-5rem)] flex overflow-hidden bg-background">
        <div className="hidden lg:flex flex-col w-72 border-r border-primary/20 bg-black/30">
          <div className="p-4 border-b border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="font-tech font-bold text-xs text-primary uppercase tracking-wider">
                Mission
              </span>
            </div>
            <p className="text-sm text-foreground/80 line-clamp-3">
              {session.objective}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "mt-2 text-[10px]",
                session.status === "active"
                  ? "text-green-400 border-green-500/30"
                  : "text-muted-foreground",
              )}
            >
              {session.status?.toUpperCase()}
            </Badge>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="font-tech font-bold text-xs text-primary uppercase tracking-wider">
                  Team ({teamBots.length})
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] font-tech border-primary/30 hover:border-primary/60 px-2"
                onClick={() => setSaveTemplateOpen(true)}
              >
                <Save className="w-3 h-3 mr-1" />
                Save as Template
              </Button>
            </div>
            <div className="space-y-2 mb-5">
              {teamBots.map((bot) => (
                <div
                  key={bot.id}
                  className="flex items-center gap-2 p-2 rounded bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                    {bot.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .substring(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-tech font-bold truncate">
                      {bot.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {bot.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-primary/10 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Network className="w-4 h-4 text-primary" />
                <span className="font-tech font-bold text-xs text-primary uppercase tracking-wider">
                  Bot Communications
                </span>
              </div>
              <BotCommunicationsPanel sessionId={sessionId} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <AnimatePresence>
            {activeAlerts.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {activeAlerts.map((alert, idx) => (
                  <div
                    key={`${alert.messageId}-${alert.role}-${idx}`}
                    className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/20"
                  >
                    <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-tech text-yellow-300">
                        ADD THINKING POWER:
                      </span>{" "}
                      <span className="text-sm text-foreground/80">
                        {alert.suggestedBy} recommends adding{" "}
                        <strong>{alert.role}</strong>
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs font-tech border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
                        onClick={() => handleApproveAlert(alert)}
                        disabled={
                          fabricateMutation.isPending ||
                          expandSession.isPending
                        }
                      >
                        {fabricateMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleDismissAlert(alert)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/20 bg-black/30 lg:hidden">
            <Target className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-sm text-foreground/80 truncate font-tech flex-1">
              {session.objective}
            </p>
            <Badge
              variant="outline"
              className="text-[10px] flex-shrink-0 text-green-400 border-green-500/30"
            >
              {teamBots.length} BOTS
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] font-tech border-primary/30 hover:border-primary/60 px-2 flex-shrink-0"
              onClick={() => setSaveTemplateOpen(true)}
            >
              <BookmarkPlus className="w-3 h-3 mr-1" />
              Save Template
            </Button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-2 font-tech"
          >
            {messages?.length === 0 && !isStreaming ? (
              <div className="text-primary/50 italic text-sm text-center py-8">
                Start the discussion — your team is ready.
              </div>
            ) : (
              messages?.map((msg) => {
                const isUser = msg.role === "user";
                const msgType = (msg as { messageType?: string }).messageType || "text";
                const toolData = (msg as { toolData?: unknown }).toolData;

                if (msgType === "tool_call" || msgType === "tool_result") {
                  return (
                    <div key={msg.id} className="ml-4">
                      <MessageToolSteps toolData={toolData} messageType={msgType} />
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex flex-col py-3 px-4 rounded border-l-2",
                      isUser
                        ? "bg-cyan/5 border-cyan"
                        : "bg-secondary/40 border-primary/50 hover:bg-secondary/60 transition-colors",
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-bold text-sm tracking-wider uppercase",
                            isUser ? "text-cyan" : "text-primary",
                          )}
                        >
                          {isUser ? "ARCHITECT" : msg.botName}
                        </span>
                        {!isUser && msg.botTitle && (
                          <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
                            {msg.botTitle}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground opacity-50">
                        {format(new Date(msg.createdAt), "HH:mm:ss")}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "text-sm",
                        isUser ? "text-cyan/90" : "text-foreground/90",
                      )}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                );
              })
            )}

            {isStreaming && (
              <div className="space-y-2 mt-2">
                <ToolStepsDisplay events={streamEvents} />
                <WorkingIndicator botName={currentWorkingBot} />
              </div>
            )}
          </div>

          <div className="p-4 border-t border-primary/20 bg-background/50">
            <form onSubmit={handleSend} className="flex gap-4">
              <div className="flex-1 relative">
                <Terminal className="absolute left-3 top-3 w-5 h-5 text-primary/50" />
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Direct your task team..."
                  className="pl-10 bg-black/50 border-primary/30 text-primary placeholder:text-primary/30 font-tech focus-visible:ring-primary/50"
                  disabled={isStreaming}
                />
              </div>
              <Button
                type="submit"
                disabled={!content.trim() || isStreaming}
                variant="glow"
                className="font-tech tracking-widest"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    SEND
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <SaveAsTemplateModal
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        defaultObjective={session.objective || ""}
        defaultBots={teamBots.map((b) => b.name)}
      />
    </AppLayout>
  );
}
