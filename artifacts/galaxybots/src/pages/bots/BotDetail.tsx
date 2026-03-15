import { AppLayout } from "@/components/layout/AppLayout";
import { useBot } from "@/hooks/use-bots";
import { useStartConversation, useConversations, useChatMessages, useSendChatMessage } from "@/hooks/use-chat";
import { useSSEStream, type AgenticEvent } from "@/hooks/use-sse";
import { ToolStepsDisplay, WorkingIndicator, MessageToolSteps } from "@/components/ToolStepCard";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, BotIcon, User, Terminal, Brain, MessageSquare, Phone, ChevronDown, ChevronUp, Sparkles, Lock } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetConversationMessagesQueryKey } from "@workspace/api-client-react";
import { MemoryAudit } from "@/components/memory/MemoryAudit";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface ImprovementRun {
  id: number;
  configId: number;
  callsAnalyzed: number;
  previousPromptSnapshot: string | null;
  newPromptSnapshot: string | null;
  improvementNotes: string | null;
  createdAt: string;
}

export default function BotDetail() {
  const params = useParams();
  const botId = parseInt(params.id || "0");
  const { user } = useAuth();

  const MOA_PLANS = ["team", "enterprise"];
  const canUseMoA = !!(user?.bypassPayment || (user?.plan && MOA_PLANS.includes(user.plan)));

  const { data: bot, isLoading: botLoading } = useBot(botId);
  const { data: conversations } = useConversations(null, botId);
  
  const activeConvo = conversations?.[0];
  
  const startConvo = useStartConversation();
  const [isStarting, setIsStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "memory">("chat");

  const handleStartChat = async () => {
    if (!bot) return;
    setIsStarting(true);
    try {
      await startConvo.mutateAsync({
        data: { botId: bot.id, title: `Chat with ${bot.name}` }
      });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-4 sm:py-8 h-[calc(100dvh-5rem)]">
        {botLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !bot ? (
          <div className="h-full flex items-center justify-center text-xl text-muted-foreground">
            Bot not found
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 h-full min-h-0">
            <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-10 min-h-0 max-h-[40vh] lg:max-h-none">
              <Card className="border-primary/20 shadow-[0_0_30px_rgba(123,97,255,0.05)]">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto w-24 h-24 rounded-2xl bg-secondary flex items-center justify-center border-2 border-primary/30 mb-4 shadow-xl shadow-primary/10">
                    {bot.avatar ? (
                      <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <BotIcon className="w-12 h-12 text-primary" />
                    )}
                  </div>
                  <CardTitle className="text-2xl mb-1">{bot.name}</CardTitle>
                  <p className="text-cyan font-tech font-medium">{bot.title}</p>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-tech">Department</p>
                    <p className="font-medium">{bot.department}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-tech">Personality</p>
                    <p className="text-sm italic text-foreground/80">"{bot.personality}"</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-tech">Bio</p>
                    <p className="text-sm leading-relaxed">{bot.description}</p>
                  </div>
                  
                  {bot.addonType === "receptionist" && (
                    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                      <Link href="/bots/ai-receptionist">
                        <Button variant="glow" className="w-full gap-2">
                          <Phone className="w-4 h-4" />
                          Configure Receptionist
                        </Button>
                      </Link>
                      <ReceptionistImprovementHistory />
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border/50">
                    <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wider font-tech">Core Responsibilities</p>
                    <ul className="space-y-2">
                      {bot.responsibilities.map((r, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <Terminal className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span className="text-foreground/80">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2 flex flex-col min-h-0 flex-1">
              <div className="flex gap-1 mb-3">
                <Button
                  variant={activeTab === "chat" ? "glow" : "ghost"}
                  size="sm"
                  className="font-tech text-xs"
                  onClick={() => setActiveTab("chat")}
                >
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                  Chat
                </Button>
                <Button
                  variant={activeTab === "memory" ? "glow" : "ghost"}
                  size="sm"
                  className="font-tech text-xs"
                  onClick={() => setActiveTab("memory")}
                >
                  <Brain className="w-3.5 h-3.5 mr-1.5" />
                  Memory
                </Button>
              </div>

              {activeTab === "chat" ? (
                <Card className="flex-1 flex flex-col overflow-hidden border-border/40 min-h-0">
                  <CardHeader className="bg-secondary/30 border-b border-border/40 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                      <CardTitle className="text-lg">Secure Channel: {bot.name}</CardTitle>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 p-0 flex flex-col overflow-hidden relative min-h-0">
                    {!activeConvo ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background/50">
                        <BotIcon className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                        <h3 className="text-xl font-display mb-2">Initialize Connection</h3>
                        <p className="text-muted-foreground mb-6 max-w-md">
                          Open a secure communication channel with this director to request analysis, strategies, or operational tasks.
                        </p>
                        <Button variant="glow" onClick={handleStartChat} disabled={isStarting} className="min-h-[44px]">
                          {isStarting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Terminal className="w-4 h-4 mr-2" />}
                          Open Channel
                        </Button>
                      </div>
                    ) : (
                      <ChatInterface conversationId={activeConvo.id} botName={bot.name} canUseMoA={canUseMoA} />
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="flex-1 overflow-y-auto pb-10">
                  <MemoryAudit botId={botId} botName={bot.name} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function MoAWorkingIndicator({ events, botName }: { events: AgenticEvent[]; botName: string }) {
  const progressEvents = events.filter(e => e.type === "moa_progress");
  const isSynthesizing = events.some(e => e.type === "moa_synthesizing");
  const latest = progressEvents[progressEvents.length - 1];
  const completed = latest?.moaIndex ?? 0;
  const total = latest?.moaTotal ?? 10;

  if (isSynthesizing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
        <Sparkles className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-xs font-tech text-purple-300">Synthesizing all 10 perspectives…</span>
          <div className="w-full bg-purple-500/20 rounded-full h-1">
            <div className="bg-purple-400 h-1 rounded-full w-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (progressEvents.length > 0) {
    const pct = Math.round((completed / total) * 100);
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
        <Brain className="w-4 h-4 text-purple-400 animate-pulse shrink-0" />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-xs font-tech text-purple-300">
            Deep Thinking — {completed}/{total} perspectives captured
          </span>
          <div className="w-full bg-purple-500/20 rounded-full h-1">
            <div
              className="bg-purple-400 h-1 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="text-xs font-tech text-purple-400 shrink-0">{pct}%</span>
      </div>
    );
  }

  return <WorkingIndicator botName={botName} />;
}

function ChatInterface({ conversationId, botName, canUseMoA }: { conversationId: number, botName: string, canUseMoA: boolean }) {
  const { data: messages, isLoading } = useChatMessages(conversationId);
  const [input, setInput] = useState("");
  const [moaEnabled, setMoaEnabled] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const onStreamComplete = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetConversationMessagesQueryKey(conversationId),
    });
  }, [queryClient, conversationId]);

  const { isStreaming, events: streamEvents, startStream } = useSSEStream({
    onComplete: onStreamComplete,
  });

  const hasMoaEvents = streamEvents.some(e => e.type === "moa_progress" || e.type === "moa_synthesizing");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamEvents]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    const content = input;
    setInput("");
    
    await startStream(`/api/conversations/${conversationId}/messages/stream`, {
      content,
      senderName: "CEO",
      moa: moaEnabled,
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" />
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 z-10 min-h-0">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages?.length === 0 && !isStreaming ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground italic text-sm">
            Connection established. Waiting for input...
          </div>
        ) : (
          messages?.map((msg) => {
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';
            const msgType = (msg as { messageType?: string }).messageType || "text";
            const toolData = (msg as { toolData?: unknown }).toolData as Record<string, unknown> | null | undefined;
            const isMoaResponse = !isUser && toolData?.moa === true;

            if (msgType === "tool_call" || msgType === "tool_result") {
              return (
                <div key={msg.id} className="ml-12">
                  <MessageToolSteps toolData={toolData} messageType={msgType} />
                </div>
              );
            }
            
            if (isSystem) {
              return (
                <div key={msg.id} className="text-center w-full my-2">
                  <Badge variant="outline" className="bg-background/80 text-xs font-tech text-muted-foreground border-border/50">
                    {msg.content}
                  </Badge>
                </div>
              );
            }

            return (
              <div key={msg.id} className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
                <div className={cn("flex gap-3 max-w-[90%] sm:max-w-[75%]", isUser ? "flex-row-reverse" : "flex-row")}>
                  
                  <div className="shrink-0 mt-1">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border",
                      isUser ? "bg-cyan/20 border-cyan/50" : isMoaResponse ? "bg-purple-500/20 border-purple-500/50" : "bg-primary/20 border-primary/50"
                    )}>
                      {isUser ? <User className="w-4 h-4 text-cyan" /> : isMoaResponse ? <Sparkles className="w-4 h-4 text-purple-400" /> : <BotIcon className="w-4 h-4 text-primary" />}
                    </div>
                  </div>

                  <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-xs text-muted-foreground font-tech">
                        {isUser ? msg.senderName || "CEO" : botName} • {format(new Date(msg.createdAt), 'HH:mm')}
                      </span>
                      {isMoaResponse && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-tech">
                          <Sparkles className="w-2.5 h-2.5" />
                          DEEP THINKING
                        </span>
                      )}
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      isUser 
                        ? "bg-cyan/10 border border-cyan/20 text-foreground rounded-tr-sm" 
                        : isMoaResponse
                          ? "bg-purple-500/5 border border-purple-500/20 text-foreground rounded-tl-sm shadow-md shadow-purple-500/5"
                          : "bg-secondary border border-border/50 text-foreground rounded-tl-sm shadow-md"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {isStreaming && (
          <div className="space-y-2 ml-12">
            {hasMoaEvents ? (
              <MoAWorkingIndicator events={streamEvents} botName={botName} />
            ) : (
              <>
                <ToolStepsDisplay events={streamEvents} />
                <WorkingIndicator botName={botName} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/40 bg-background/80 supports-[backdrop-filter]:backdrop-blur-md z-10" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        {moaEnabled && canUseMoA && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span className="text-xs font-tech text-purple-300">Deep Thinking active — 10 parallel perspectives</span>
            </div>
          </div>
        )}
        {showUpgrade && (
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex-1">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-tech text-amber-300">Deep Thinking requires Team or Enterprise plan</span>
              <Link href="/billing" className="ml-auto text-xs font-tech text-amber-400 underline hover:text-amber-300 shrink-0">
                Upgrade →
              </Link>
            </div>
            <button type="button" onClick={() => setShowUpgrade(false)} className="text-muted-foreground hover:text-foreground text-xs shrink-0">✕</button>
          </div>
        )}
        <div className="p-4 pt-3">
          <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto relative items-center">
            <button
              type="button"
              onClick={() => {
                if (!canUseMoA) { setShowUpgrade(true); return; }
                setShowUpgrade(false);
                setMoaEnabled(v => !v);
              }}
              title={!canUseMoA ? "Deep Thinking — Team/Enterprise plan required" : moaEnabled ? "Deep Thinking ON — click to disable" : "Enable Deep Thinking (MoA)"}
              className={cn(
                "shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200",
                !canUseMoA
                  ? "bg-secondary/50 border-border text-muted-foreground/50 cursor-not-allowed"
                  : moaEnabled
                    ? "bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                    : "bg-secondary/50 border-border text-muted-foreground hover:border-purple-500/40 hover:text-purple-400"
              )}
            >
              {!canUseMoA ? <Lock className="w-3.5 h-3.5" /> : <Brain className="w-4 h-4" />}
            </button>
            <Input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={moaEnabled ? "Issue directive for deep analysis…" : "Issue directive..."} 
              className={cn(
                "flex-1 bg-secondary/50 border-border shadow-inner font-tech min-h-[44px] transition-colors",
                moaEnabled && "border-purple-500/30 focus-visible:ring-purple-500/30"
              )}
              disabled={isStreaming}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className={cn("px-6 shrink-0 min-w-[44px] min-h-[44px]", moaEnabled && "bg-purple-600 hover:bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]")}
              variant={input.trim() && !moaEnabled ? "glow" : "secondary"}
            >
              {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CLIENT_ID = 1; // Platform-wide default: no auth system exists yet. Replace with auth context when added.

function ReceptionistImprovementHistory() {
  const [expanded, setExpanded] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["receptionist-config", DEFAULT_CLIENT_ID],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/receptionist/config/${DEFAULT_CLIENT_ID}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ id: number } | null>;
    },
  });

  const { data: runs } = useQuery<ImprovementRun[]>({
    queryKey: ["improvement-history", config?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/receptionist/improvement-history/${config!.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!config?.id,
  });

  if (!runs || runs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground mt-2 p-2 rounded bg-secondary/30">
        <Brain className="w-3 h-3 inline mr-1" />
        No self-improvement runs yet. Improvement triggers after every 10 completed calls.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="w-3 h-3" />
        <span>Self-Improvement History ({runs.length} runs)</span>
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
          {runs.map(run => (
            <div key={run.id} className="p-2 rounded bg-secondary/30 border border-border/30 text-xs">
              <div className="flex justify-between text-muted-foreground mb-1">
                <span>{run.callsAnalyzed} calls analyzed</span>
                <span>{format(new Date(run.createdAt), "MMM d, yyyy HH:mm")}</span>
              </div>
              {run.improvementNotes && (
                <p className="text-foreground/80">{run.improvementNotes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
