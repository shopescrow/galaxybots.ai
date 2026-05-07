import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useStartConversation, useConversations, useChatMessages } from "@/hooks/use-chat";
import { useSSEStream } from "@/hooks/use-sse";
import { getGetConversationMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MessageSquare, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ChatSlideOver({ botId, onClose }: { botId: number; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);

  const { data: conversations } = useConversations(null, botId);
  const startConvo = useStartConversation();
  const { data: messages } = useChatMessages(activeConvoId ?? 0);

  useEffect(() => {
    if (conversations?.[0]?.id) {
      setActiveConvoId(conversations[0].id);
    }
  }, [conversations]);

  const onStreamComplete = useCallback(() => {
    if (activeConvoId) {
      queryClient.invalidateQueries({ queryKey: getGetConversationMessagesQueryKey(activeConvoId) });
    }
  }, [activeConvoId, queryClient]);

  const onStreamError = useCallback((error: string) => {
    toast({ title: "Chat error", description: error || "Failed to send message", variant: "destructive" });
  }, [toast]);

  const { isStreaming, events: streamEvents, startStream } = useSSEStream({
    onComplete: onStreamComplete,
    onError: onStreamError,
  });

  const streamingText = streamEvents
    .filter((e) => e.type === "message")
    .map((e) => e.content ?? "")
    .join("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamEvents]);

  const ensureConversation = async (): Promise<number> => {
    if (activeConvoId) return activeConvoId;
    const convo = await startConvo.mutateAsync({ data: { botId, title: "CFO Dashboard Chat" } });
    const id = convo.id;
    setActiveConvoId(id);
    return id;
  };

  const handleSend = async () => {
    if (!message.trim() || isStreaming) return;
    const content = message.trim();
    setMessage("");

    try {
      const convoId = await ensureConversation();
      await startStream(`${BASE}/api/conversations/${convoId}/messages/stream`, {
        content,
        senderName: "User",
      });
    } catch (err) {
      toast({
        title: "Failed to send message",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-background border-l border-border shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">CFO Sentinel Marcus</span>
          <Badge variant="outline" className="text-[10px]">Finance Director</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(!messages || messages.length === 0) && !isStreaming && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-primary/40" />
            <p>Ask Marcus about any metric, trend, or financial decision.</p>
          </div>
        )}
        {(messages ?? []).map((m: { id: number; role: string; content: string }) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-sm",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-muted">
              {streamingText || <span className="animate-pulse">▊</span>}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Marcus anything..."
            disabled={isStreaming}
            className="text-sm"
          />
          <Button size="sm" onClick={handleSend} disabled={isStreaming || !message.trim()}>
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
