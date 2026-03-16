import { useEffect, useState, useRef, useCallback } from "react";
import { useDemo } from "@/contexts/DemoContext";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Bot, Clock, DollarSign, TrendingUp,
  Zap, MessageSquare, ArrowRight, Shield,
  Play, Loader2, Send, X, Sparkles
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: string;
  botName?: string;
  botTitle?: string;
  messageType?: string;
  toolData?: { toolName?: string; input?: unknown; output?: unknown };
  sandboxed?: boolean;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function DemoCountdownBanner() {
  const { remainingMs, demoSession } = useDemo();
  const [, navigate] = useLocation();

  if (!demoSession) return null;

  const isLow = remainingMs < 5 * 60 * 1000;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 py-3 px-4 text-center text-sm font-tech border-t ${
      isLow
        ? "bg-red-500/20 border-red-500/30 text-red-200"
        : "bg-primary/10 border-primary/30 text-primary"
    }`}>
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Demo expires in <strong>{formatTime(remainingMs)}</strong></span>
        </div>
        <Button
          size="sm"
          variant="glow"
          className="gap-1"
          onClick={() => navigate("/demo/claim")}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Create Account to Save
        </Button>
      </div>
    </div>
  );
}

function DemoROICard() {
  const { roiData, demoSession } = useDemo();
  const [, navigate] = useLocation();
  const prefersReducedMotion = useReducedMotion();

  if (!roiData) return null;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl p-6 rounded-2xl bg-card border border-primary/20 neon-border"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center border border-gold/20">
          <TrendingUp className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold">Mission ROI Summary</h3>
          <p className="text-xs text-muted-foreground font-tech">Estimated value from this demo session</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-4 rounded-xl bg-secondary/50 border border-border/50">
          <Clock className="w-5 h-5 text-cyan mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-cyan">{roiData.estimatedHoursSaved}h</div>
          <div className="text-xs text-muted-foreground font-tech">Hours Saved</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-secondary/50 border border-border/50">
          <DollarSign className="w-5 h-5 text-gold mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-gold">${roiData.estimatedCostSavings.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground font-tech">Value Generated</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-secondary/50 border border-border/50">
          <MessageSquare className="w-5 h-5 text-primary mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-primary">{roiData.messageCount}</div>
          <div className="text-xs text-muted-foreground font-tech">Bot Insights</div>
        </div>
      </div>

      <Button
        variant="glow"
        className="w-full gap-2"
        onClick={() => navigate("/demo/claim")}
      >
        <Sparkles className="w-4 h-4" />
        Create Your Account to Keep This Session
        <ArrowRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}

export default function LiveDemo() {
  const {
    demoSession, isDemo, isStarting, startDemo, completeDemo,
    missionCompleted, roiData, clearDemo,
  } = useDemo();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [, navigate] = useLocation();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!demoSession) return;

    setIsLoadingMessages(true);
    fetch(`${BASE}/api/task-sessions/${demoSession.taskSessionId}/messages`, {
      headers: { Authorization: `Bearer ${demoSession.token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(
            data.map((m: any) => ({
              id: String(m.id),
              role: m.role === "user" ? "user" : "bot",
              content: m.content,
              botName: m.botName,
              botTitle: m.botTitle,
              messageType: m.messageType,
              toolData: m.toolData,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingMessages(false));
  }, [demoSession]);

  const sendMessage = useCallback(async () => {
    if (!demoSession || !inputValue.trim() || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsSending(true);

    try {
      const res = await fetch(
        `${BASE}/api/task-sessions/${demoSession.taskSessionId}/messages/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${demoSession.token}`,
          },
          body: JSON.stringify({
            content: userMessage.content,
            senderName: "Guest CEO",
          }),
        }
      );

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "message" && event.botName) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `bot-${Date.now()}-${event.botId || Math.random()}`,
                    role: "bot",
                    content: event.content || "",
                    botName: event.botName,
                    botTitle: event.botTitle,
                  },
                ]);
              } else if (event.type === "tool_call") {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `tool-${Date.now()}-${Math.random()}`,
                    role: "bot",
                    content: `Using tool: ${event.toolName}`,
                    botName: event.botName,
                    botTitle: event.botTitle,
                    messageType: "tool_call",
                    toolData: { toolName: event.toolName, input: event.input },
                  },
                ]);
              } else if (event.type === "tool_result") {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `result-${Date.now()}-${Math.random()}`,
                    role: "bot",
                    content: `Tool result: ${event.toolName}`,
                    botName: event.botName,
                    botTitle: event.botTitle,
                    messageType: "tool_result",
                    toolData: { toolName: event.toolName, output: event.output },
                    sandboxed: event.sandboxed,
                  },
                ]);
              }
            } catch {}
          }
        }
      }

      if (messages.length > 3 && !missionCompleted) {
        completeDemo();
      }
    } catch (err) {
      console.error("Send error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "bot",
          content: "Connection error. Please try again.",
          botName: "System",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [demoSession, inputValue, isSending, messages.length, missionCompleted, completeDemo]);

  if (!isDemo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-xl text-center space-y-8">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-tech text-sm mb-6">
              <Play className="w-3.5 h-3.5" />
              LIVE DEMO
            </div>
            <h1 className="text-3xl sm:text-5xl font-display font-bold mb-4">
              Experience the
              <span className="text-gradient"> AI Boardroom</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              Watch a team of AI executives collaborate in real time to solve a real business
              problem. No signup required.
            </p>

            <div className="glass-panel p-6 rounded-2xl neon-border mb-8 text-left">
              <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-3">
                Demo Mission
              </div>
              <p className="text-sm text-foreground/80 mb-4">
                "Analyze our Q2 marketing performance and recommend a growth strategy for next quarter"
              </p>
              <div className="flex flex-wrap gap-2">
                {["CMO", "CFO", "Head of Growth"].map((role) => (
                  <span
                    key={role}
                    className="px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs font-tech text-primary"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>

            <Button
              variant="glow"
              size="lg"
              className="gap-2"
              onClick={startDemo}
              disabled={isStarting}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assembling Team...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Launch Live Demo
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground mt-4">
              30-minute session. No email required. Real AI, real results.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
              <span className="text-sm font-tech text-cyan">LIVE DEMO</span>
            </div>
            <span className="text-xs text-muted-foreground">|</span>
            <span className="text-sm font-display font-bold">{demoSession?.company.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs font-tech text-muted-foreground">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              {formatTime(remainingMs)}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                clearDemo();
                navigate("/");
              }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <div className="p-4 border-b border-border/30">
          <div className="glass-panel p-4 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center border border-gold/20 shrink-0">
                <Shield className="w-4 h-4 text-gold" />
              </div>
              <div>
                <div className="text-xs font-tech text-gold uppercase tracking-wider mb-1">Mission Objective</div>
                <p className="text-sm text-foreground/80">{demoSession?.mission}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {demoSession?.team?.map((bot) => (
                    <span
                      key={bot.id}
                      className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-xs font-tech text-primary"
                    >
                      {bot.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-40">
          {isLoadingMessages && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading session...</p>
            </div>
          )}

          {messages.length === 0 && !isLoadingMessages && (
            <div className="text-center py-12 space-y-4">
              <Bot className="w-12 h-12 text-primary mx-auto opacity-30" />
              <p className="text-muted-foreground">
                Your AI team is assembled and ready. Send a message to begin the mission.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setInputValue("Begin the Q2 marketing analysis. Each director, share your initial assessment.");
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                Use suggested prompt
              </Button>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "bot" && (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary/20 border border-primary/30"
                      : msg.messageType === "tool_call"
                        ? "bg-cyan/10 border border-cyan/20"
                        : msg.messageType === "tool_result"
                          ? `border ${msg.sandboxed ? "bg-yellow-500/10 border-yellow-500/20" : "bg-secondary/50 border-border/50"}`
                          : "bg-card border border-border/50"
                  }`}
                >
                  {msg.role === "bot" && msg.botName && (
                    <div className="text-xs font-tech text-primary mb-1">
                      {msg.botName}
                      {msg.botTitle && <span className="text-muted-foreground"> — {msg.botTitle}</span>}
                    </div>
                  )}
                  {msg.messageType === "tool_call" && msg.toolData?.toolName && (
                    <div className="flex items-center gap-2 text-xs font-tech text-cyan mb-1">
                      <Zap className="w-3 h-3" />
                      {msg.toolData.toolName}
                    </div>
                  )}
                  {msg.sandboxed && (
                    <div className="flex items-center gap-1 text-xs font-tech text-yellow-400 mb-1">
                      <Shield className="w-3 h-3" />
                      Sandboxed — sign up to enable real actions
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {roiData && (
          <div className="p-4 border-t border-border/30">
            <DemoROICard />
          </div>
        )}

        <div className="sticky bottom-12 p-4 bg-background/80 backdrop-blur-md border-t border-border/30">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message to your AI team..."
              className="flex-1 bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={isSending}
            />
            <Button
              variant="glow"
              size="sm"
              className="px-4"
              onClick={sendMessage}
              disabled={isSending || !inputValue.trim()}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <DemoCountdownBanner />
    </div>
  );
}
