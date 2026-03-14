import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BotIcon, ArrowRight, Radio, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BotDeclaration {
  id: number;
  name: string;
  title: string;
  department: string;
  avatar: string | null;
  declaration: string;
}

const DEPARTMENT_COLORS: Record<string, string> = {
  "Board of Directors": "from-amber-500/20 to-amber-600/5 border-amber-500/30 text-amber-400",
  "Executive Leadership": "from-purple-500/20 to-purple-600/5 border-purple-500/30 text-purple-400",
  "Operations": "from-blue-500/20 to-blue-600/5 border-blue-500/30 text-blue-400",
  "Sales & Marketing": "from-green-500/20 to-green-600/5 border-green-500/30 text-green-400",
  "Finance & Legal": "from-red-500/20 to-red-600/5 border-red-500/30 text-red-400",
  "Technology & Product": "from-cyan-500/20 to-cyan-600/5 border-cyan-500/30 text-cyan-400",
  "Human Resources": "from-pink-500/20 to-pink-600/5 border-pink-500/30 text-pink-400",
  "Strategy & Innovation": "from-indigo-500/20 to-indigo-600/5 border-indigo-500/30 text-indigo-400",
};

const DEPARTMENT_BADGE: Record<string, string> = {
  "Board of Directors": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "Executive Leadership": "bg-purple-500/10 text-purple-400 border-purple-500/30",
  "Operations": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "Sales & Marketing": "bg-green-500/10 text-green-400 border-green-500/30",
  "Finance & Legal": "bg-red-500/10 text-red-400 border-red-500/30",
  "Technology & Product": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  "Human Resources": "bg-pink-500/10 text-pink-400 border-pink-500/30",
  "Strategy & Innovation": "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
};

const DEPARTMENT_GLOW: Record<string, string> = {
  "Board of Directors": "shadow-amber-500/20",
  "Executive Leadership": "shadow-purple-500/20",
  "Operations": "shadow-blue-500/20",
  "Sales & Marketing": "shadow-green-500/20",
  "Finance & Legal": "shadow-red-500/20",
  "Technology & Product": "shadow-cyan-500/20",
  "Human Resources": "shadow-pink-500/20",
  "Strategy & Innovation": "shadow-indigo-500/20",
};

function TypewriterText({ text, speed = 20 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) return;
    let i = 0;
    setDisplayed("");
    setDone(false);
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className="font-mono text-sm leading-relaxed text-muted-foreground">
      {displayed}
      {!done && <span className="animate-pulse text-primary">|</span>}
    </span>
  );
}

function BotActivationCard({
  bot,
  index,
  isNew,
}: {
  bot: BotDeclaration;
  index: number;
  isNew: boolean;
}) {
  const colorClass = DEPARTMENT_COLORS[bot.department] || "from-gray-500/20 to-gray-600/5 border-gray-500/30 text-gray-400";
  const badgeClass = DEPARTMENT_BADGE[bot.department] || "bg-gray-500/10 text-gray-400 border-gray-500/30";
  const glowClass = DEPARTMENT_GLOW[bot.department] || "shadow-gray-500/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: isNew ? 0 : index * 0.03 }}
      className={cn(
        "relative rounded-xl border bg-gradient-to-br p-5 shadow-lg backdrop-blur-sm",
        colorClass,
        glowClass
      )}
    >
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-lg bg-background/50 border border-border/50 flex items-center justify-center overflow-hidden">
            {bot.avatar ? (
              <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover" />
            ) : (
              <BotIcon className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
            <CheckCircle2 className="w-3 h-3 text-background" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-foreground text-sm">{bot.name}</h3>
            <span className="text-xs text-muted-foreground">— {bot.title}</span>
          </div>
          <div className="mb-3">
            <span className={cn("text-[10px] font-tech uppercase tracking-wider px-2 py-0.5 rounded-full border", badgeClass)}>
              {bot.department}
            </span>
          </div>
          <div className="relative">
            <div className="absolute -left-3 top-0 bottom-0 w-px bg-primary/20" />
            {isNew ? (
              <TypewriterText text={bot.declaration} speed={15} />
            ) : (
              <span className="font-mono text-sm leading-relaxed text-muted-foreground">
                {bot.declaration}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Assembly() {
  const [declarations, setDeclarations] = useState<BotDeclaration[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBots, setTotalBots] = useState(0);
  const [newBotIds, setNewBotIds] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const apiBase = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      scrollToBottom();
    }
  }, [declarations.length, scrollToBottom, isStreaming]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function loadDeclarations() {
      try {
        const res = await fetch(`${apiBase}/bots/declarations`);
        const data = await res.json();
        const withDeclarations = data.filter((b: BotDeclaration) => b.declaration);
        setTotalBots(data.length);

        if (withDeclarations.length === data.length) {
          setDeclarations(withDeclarations);
          setIsComplete(true);
          setIsLoading(false);
          return;
        }

        if (withDeclarations.length > 0) {
          setDeclarations(withDeclarations);
        }

        setIsLoading(false);
        startStreaming();
      } catch {
        setIsLoading(false);
        startStreaming();
      }
    }

    function startStreaming() {
      setIsStreaming(true);

      fetch(`${apiBase}/bots/generate-declarations`, { method: "POST" })
        .then((response) => {
          if (!response.ok || !response.body) {
            setIsStreaming(false);
            setIsComplete(true);
            return;
          }
          const reader = response.body.getReader();

          const decoder = new TextDecoder();
          let buffer = "";

          function processBuffer() {
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6));
                  handleSSEEvent(event);
                } catch {
                  // skip invalid JSON
                }
              }
            }
          }

          function read(): Promise<void> {
            return reader!.read().then(({ done, value }) => {
              if (done) {
                if (buffer) processBuffer();
                setIsStreaming(false);
                setIsComplete(true);
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              processBuffer();
              return read();
            });
          }

          read();
        })
        .catch(() => {
          setIsStreaming(false);
        });
    }

    function handleSSEEvent(event: Record<string, unknown>) {
      if (event.type === "started") {
        setTotalBots(event.total as number);
      } else if (event.type === "progress") {
        const result = event.result as (BotDeclaration & { cached: boolean }) | undefined;
        if (result && result.declaration) {
          if (!result.cached) {
            setNewBotIds((prev) => new Set(prev).add(result.id));
          }
          setDeclarations((prev) => {
            if (prev.some((d) => d.id === result.id)) return prev;
            return [...prev, result];
          });
        }
      } else if (event.type === "complete") {
        setIsStreaming(false);
        setIsComplete(true);
      }
    }

    loadDeclarations();
  }, [apiBase]);

  const activatedCount = declarations.length;
  const progress = totalBots > 0 ? Math.round((activatedCount / totalBots) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <span className="font-display font-bold text-lg tracking-wider">
                GALAXY<span className="text-primary">BOTS</span>
              </span>
            </Link>
            <span className="text-border">/</span>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-primary animate-pulse" />
              <span className="font-tech text-sm text-primary uppercase tracking-wider">
                Global Assembly
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-xs font-tech text-muted-foreground">
              <span>{activatedCount} / {totalBots || "..."} ACTIVATED</span>
              <div className="w-32 h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span>{progress}%</span>
            </div>
            {isComplete && (
              <Link href="/">
                <Button variant="glow" size="sm" className="font-tech text-xs gap-1">
                  Enter the World <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div ref={scrollRef} className="relative z-10 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="container mx-auto px-4 py-8 max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-12"
            >
              <h1 className="text-2xl sm:text-5xl font-bold mb-4 tracking-tight">
                <span className="text-gradient">Global Assembly</span>
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto font-tech">
                Every agent is stepping forward. Every mind is coming online.
                <br />
                The organization is activating.
              </p>
            </motion.div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-tech text-muted-foreground">
                  INITIALIZING ASSEMBLY SEQUENCE...
                </p>
              </div>
            ) : (
              <div className="space-y-4 pb-24">
                <AnimatePresence mode="popLayout">
                  {declarations.map((bot, i) => (
                    <BotActivationCard
                      key={bot.id}
                      bot={bot}
                      index={i}
                      isNew={newBotIds.has(bot.id)}
                    />
                  ))}
                </AnimatePresence>

                {isStreaming && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center gap-3 py-8"
                  >
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs font-tech text-muted-foreground uppercase">
                      Activating next agent...
                    </span>
                  </motion.div>
                )}

                {isComplete && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="text-center py-12"
                  >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-tech text-sm mb-6">
                      <CheckCircle2 className="w-4 h-4" />
                      ALL AGENTS ONLINE
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                      Assembly Complete
                    </h2>
                    <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                      {activatedCount} agents activated and ready. The full organization
                      is online and awaiting directives.
                    </p>
                    <Link href="/">
                      <Button variant="glow" size="lg" className="gap-2 font-tech">
                        Enter the World <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
