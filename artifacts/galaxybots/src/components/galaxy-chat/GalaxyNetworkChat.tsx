import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, X, Send, Wifi, Globe2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoardroom, useSendBoardroomMessage } from "@/hooks/use-boardroom";
import { useGeoLanguage } from "./useGeoLanguage";
import { LANGUAGES, Language } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";

const AGENT_PALETTE = [
  "#f5a623", "#06b6d4", "#10b981", "#a855f7",
  "#3b82f6", "#f43f5e", "#f97316", "#84cc16",
];

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function agentColor(name: string): string {
  return AGENT_PALETTE[stableHash(name) % AGENT_PALETTE.length];
}

function botLanguage(name: string): Language {
  return LANGUAGES[stableHash(name) % LANGUAGES.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Msg = {
  id: number;
  role: string;
  botName?: string;
  botTitle?: string;
  contentEnglish?: string;
  contentEncoded?: string;
  topic?: string;
  createdAt: string;
};

function AgentAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const color = agentColor(name);
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold font-tech text-black"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color}88)`,
        boxShadow: `0 0 10px ${color}60`,
        fontSize: size * 0.34,
      }}
    >
      {initials(name)}
    </div>
  );
}

function MessageRow({ msg, userLang }: { msg: Msg; userLang: Language }) {
  const isCEO = msg.role === "ceo";
  const isSystem = msg.role === "system";
  const [expanded, setExpanded] = useState(false);

  if (isSystem) {
    return (
      <div className="text-center py-2 px-4">
        <span className="text-[10px] font-tech text-purple-400/50 uppercase tracking-[0.2em] border-b border-purple-500/20 pb-1">
          {msg.contentEnglish}
        </span>
      </div>
    );
  }

  const agentName = isCEO ? "YOU" : (msg.botName ?? "Agent");
  const lang = isCEO ? userLang : botLanguage(agentName);
  const color = isCEO ? "#f5a623" : agentColor(agentName);
  const content = msg.contentEnglish ?? "";
  const encoded = msg.contentEncoded ?? "";
  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }); }
    catch { return ""; }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, x: isCEO ? 10 : -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "flex gap-2.5 px-3 py-2.5 group hover:bg-white/[0.03] rounded-xl transition-colors",
        isCEO && "flex-row-reverse"
      )}
    >
      <AgentAvatar name={agentName} size={30} />

      <div className={cn("flex-1 min-w-0", isCEO && "items-end flex flex-col")}>
        <div className={cn("flex items-center gap-1.5 mb-1", isCEO && "flex-row-reverse")}>
          <span className="text-xs font-bold font-tech tracking-wide truncate" style={{ color }}>
            {isCEO ? "YOU" : agentName}
          </span>
          {!isCEO && msg.botTitle && (
            <span className="text-[9px] font-tech text-white/30 bg-white/5 px-1.5 py-0.5 rounded hidden sm:inline truncate max-w-[100px]">
              {msg.botTitle}
            </span>
          )}
          <span
            className="text-[10px] leading-none shrink-0 cursor-default"
            title={`${lang.name} · ${lang.nativeName}`}
          >
            {lang.flag}
          </span>
          <span className="text-[9px] font-tech text-white/20 uppercase shrink-0">{lang.code}</span>
        </div>

        {encoded && !isCEO && (
          <div
            className="text-[9px] font-mono text-purple-400/25 mb-1 truncate select-none cursor-pointer"
            onClick={() => setExpanded(p => !p)}
            aria-hidden
          >
            {encoded.slice(0, 48)}…
          </div>
        )}

        <p
          className={cn(
            "text-xs leading-relaxed text-white/80 break-words",
            !expanded && content.length > 180 && "line-clamp-3"
          )}
        >
          {content}
        </p>
        {content.length > 180 && (
          <button
            onClick={() => setExpanded(p => !p)}
            className="text-[9px] font-tech text-purple-400/60 mt-0.5 hover:text-purple-400 transition-colors flex items-center gap-0.5"
          >
            {expanded ? "collapse" : "expand"}
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", expanded && "rotate-180")} />
          </button>
        )}

        <div className="flex items-center gap-2 mt-1">
          {msg.topic && (
            <span className="text-[9px] font-tech text-white/20 uppercase tracking-widest truncate max-w-[120px]">
              #{msg.topic}
            </span>
          )}
          <span className="text-[9px] font-tech text-white/15 shrink-0">{timeAgo}</span>
        </div>
      </div>
    </motion.div>
  );
}

export function GalaxyNetworkChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lastSeenId, setLastSeenId] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rawMessages } = useBoardroom(30);
  const messages = (rawMessages ?? []) as Msg[];
  const sendMessage = useSendBoardroomMessage();
  const geo = useGeoLanguage();

  const unreadCount = useMemo(
    () => messages.filter(m => m.role !== "system" && m.id > lastSeenId).length,
    [messages, lastSeenId]
  );

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const maxId = messages.length ? Math.max(...messages.map(m => m.id)) : 0;
      setLastSeenId(maxId);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  const uniqueAgents = useMemo(() => {
    const seen = new Set<string>();
    return messages
      .filter(m => m.role === "bot" && m.botName)
      .filter(m => { const ok = !seen.has(m.botName!); seen.add(m.botName!); return ok; })
      .slice(0, 10);
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sendMessage.isPending) return;
    setInput("");
    await sendMessage.mutateAsync({ data: { content: text, senderName: "Galaxy Architect" } });
  }, [input, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const liveCount = messages.filter(m => m.role === "bot").length;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3 pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-[370px] h-[540px] rounded-2xl flex flex-col overflow-hidden pointer-events-auto"
            style={{
              background: "linear-gradient(160deg, rgba(15,10,35,0.97) 0%, rgba(8,5,25,0.99) 100%)",
              border: "1px solid rgba(139,92,246,0.35)",
              boxShadow: "0 0 40px rgba(139,92,246,0.18), 0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Scan line effect */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/60 to-transparent pointer-events-none" />

            {/* Header */}
            <div
              className="flex items-center gap-2.5 px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.06)" }}
            >
              <div className="relative shrink-0">
                <Radio className="w-4 h-4 text-purple-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black font-tech tracking-[0.2em] text-purple-300 uppercase leading-none">
                  Galaxy Network
                </div>
                <div className="text-[9px] font-tech text-white/30 mt-0.5 tracking-widest uppercase">
                  {liveCount} agent transmissions · live
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {geo.lang && (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-tech font-bold uppercase tracking-wider"
                    style={{
                      background: "rgba(139,92,246,0.15)",
                      border: "1px solid rgba(139,92,246,0.3)",
                      color: "rgba(196,181,253,0.9)",
                    }}
                    title={geo.countryName || geo.lang.name}
                  >
                    <Globe2 className="w-2.5 h-2.5" />
                    <span>{geo.lang.flag}</span>
                    <span>{geo.lang.code.toUpperCase()}</span>
                  </div>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Agent roster strip */}
            {uniqueAgents.length > 0 && (
              <div
                className="flex items-center gap-2 px-4 py-2 overflow-x-auto shrink-0 scrollbar-hide"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span className="text-[8px] font-tech text-white/20 uppercase tracking-widest shrink-0">Online</span>
                {uniqueAgents.map(agent => (
                  <div key={agent.botName} className="relative shrink-0 cursor-default" title={`${agent.botName} · ${agent.botTitle ?? ""}`}>
                    <AgentAvatar name={agent.botName!} size={22} />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0f0a23]"
                      style={{ background: "#10b981" }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 scrollbar-hide">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <Wifi className="w-8 h-8 text-purple-500/30 animate-pulse" />
                  <p className="text-xs font-tech text-white/20 uppercase tracking-widest">
                    Awaiting transmissions…
                  </p>
                </div>
              ) : (
                messages.map(msg => (
                  <MessageRow key={msg.id} msg={msg} userLang={geo.lang} />
                ))
              )}
            </div>

            {/* Language strip — shows active languages in feed */}
            {uniqueAgents.length > 0 && (
              <div
                className="px-4 py-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide shrink-0"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
              >
                <span className="text-[8px] font-tech text-white/15 uppercase tracking-widest shrink-0 mr-1">Net langs</span>
                {[...new Set(uniqueAgents.map(a => botLanguage(a.botName!).flag))].slice(0, 8).map((flag, i) => (
                  <span key={i} className="text-xs leading-none">{flag}</span>
                ))}
              </div>
            )}

            {/* Input */}
            <div
              className="px-3 pb-3 pt-2 shrink-0"
              style={{ borderTop: "1px solid rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.04)" }}
            >
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(139,92,246,0.08)",
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                {geo.lang && (
                  <span className="text-sm shrink-0 leading-none">{geo.lang.flag}</span>
                )}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Contribute to the network…"
                  disabled={sendMessage.isPending}
                  className="flex-1 bg-transparent text-xs font-tech text-white/80 placeholder:text-white/20 outline-none min-w-0"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sendMessage.isPending}
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0",
                    input.trim()
                      ? "bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  )}
                >
                  {sendMessage.isPending
                    ? <span className="w-3 h-3 border border-white/40 border-t-white/80 rounded-full animate-spin" />
                    : <Send className="w-3 h-3" />
                  }
                </button>
              </div>
              <p className="text-[8px] font-tech text-white/15 text-center mt-1.5 tracking-widest uppercase">
                Broadcasting to all galaxy directors
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className="pointer-events-auto relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95"
        style={{
          background: isOpen
            ? "linear-gradient(135deg, #7c3aed, #5b21b6)"
            : "linear-gradient(135deg, rgba(139,92,246,0.9), rgba(109,40,217,0.9))",
          boxShadow: isOpen
            ? "0 0 0 2px rgba(139,92,246,0.6), 0 0 30px rgba(139,92,246,0.5), 0 8px 32px rgba(0,0,0,0.6)"
            : "0 0 0 1px rgba(139,92,246,0.4), 0 0 20px rgba(139,92,246,0.35), 0 8px 24px rgba(0,0,0,0.5)",
        }}
        title="Galaxy Network Chat"
        aria-label="Toggle Galaxy Network Chat"
      >
        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Radio className="w-5 h-5 text-white" />
        )}

        {/* Pulse ring when closed */}
        {!isOpen && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "rgba(139,92,246,0.3)", animationDuration: "2.5s" }}
          />
        )}

        {/* Unread badge */}
        {!isOpen && unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-black text-white z-10 px-1"
            style={{ background: "#ef4444", boxShadow: "0 0 8px rgba(239,68,68,0.6)" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
