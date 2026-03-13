import { AppLayout } from "@/components/layout/AppLayout";
import { useBot } from "@/hooks/use-bots";
import { useStartConversation, useConversations, useChatMessages, useSendChatMessage } from "@/hooks/use-chat";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, BotIcon, User, Terminal } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";

export default function BotDetail() {
  const params = useParams();
  const botId = parseInt(params.id || "0");
  
  const { data: bot, isLoading: botLoading } = useBot(botId);
  const { data: conversations } = useConversations(null, botId);
  
  // Find or create active conversation
  const activeConvo = conversations?.[0]; // Simplification for demo
  
  const startConvo = useStartConversation();
  const [isStarting, setIsStarting] = useState(false);

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
      <div className="container mx-auto px-4 py-8 h-[calc(100vh-5rem)]">
        {botLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !bot ? (
          <div className="h-full flex items-center justify-center text-xl text-muted-foreground">
            Bot not found
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            {/* Left Col: Profile */}
            <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-10">
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

            {/* Right Col: Chat Interface */}
            <div className="lg:col-span-2 h-full flex flex-col">
              <Card className="flex-1 flex flex-col overflow-hidden border-border/40">
                <CardHeader className="bg-secondary/30 border-b border-border/40 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                    <CardTitle className="text-lg">Secure Channel: {bot.name}</CardTitle>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 p-0 flex flex-col h-full overflow-hidden relative">
                  {!activeConvo ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background/50">
                      <BotIcon className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                      <h3 className="text-xl font-display mb-2">Initialize Connection</h3>
                      <p className="text-muted-foreground mb-6 max-w-md">
                        Open a secure communication channel with this director to request analysis, strategies, or operational tasks.
                      </p>
                      <Button variant="glow" onClick={handleStartChat} disabled={isStarting}>
                        {isStarting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Terminal className="w-4 h-4 mr-2" />}
                        Open Channel
                      </Button>
                    </div>
                  ) : (
                    <ChatInterface conversationId={activeConvo.id} botName={bot.name} />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Extracted chat interface component
function ChatInterface({ conversationId, botName }: { conversationId: number, botName: string }) {
  const { data: messages, isLoading } = useChatMessages(conversationId);
  const sendMessage = useSendChatMessage();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;
    
    const content = input;
    setInput("");
    
    await sendMessage.mutateAsync({
      id: conversationId,
      data: { content, senderName: "CEO" }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" />
      
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 z-10">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground italic text-sm">
            Connection established. Waiting for input...
          </div>
        ) : (
          messages?.map((msg) => {
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';
            
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
                <div className={cn("flex gap-3 max-w-[85%] sm:max-w-[75%]", isUser ? "flex-row-reverse" : "flex-row")}>
                  
                  <div className="shrink-0 mt-1">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border",
                      isUser ? "bg-cyan/20 border-cyan/50" : "bg-primary/20 border-primary/50"
                    )}>
                      {isUser ? <User className="w-4 h-4 text-cyan" /> : <BotIcon className="w-4 h-4 text-primary" />}
                    </div>
                  </div>

                  <div className={cn(
                    "flex flex-col",
                    isUser ? "items-end" : "items-start"
                  )}>
                    <span className="text-xs text-muted-foreground font-tech mb-1 px-1">
                      {isUser ? msg.senderName || "CEO" : botName} • {format(new Date(msg.createdAt), 'HH:mm')}
                    </span>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      isUser 
                        ? "bg-cyan/10 border border-cyan/20 text-foreground rounded-tr-sm" 
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
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border/40 bg-background/80 backdrop-blur-md z-10">
        <form onSubmit={handleSend} className="flex gap-3 max-w-4xl mx-auto relative">
          <Input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Issue directive..." 
            className="flex-1 bg-secondary/50 border-border shadow-inner font-tech"
            disabled={sendMessage.isPending}
          />
          <Button type="submit" disabled={!input.trim() || sendMessage.isPending} className="px-6 shrink-0 w-16" variant={input.trim() ? "glow" : "secondary"}>
            {sendMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
