import { AppLayout } from "@/components/layout/AppLayout";
import { useBoardroom, useSendBoardroomMessage } from "@/hooks/use-boardroom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Terminal, ShieldAlert, Cpu } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Boardroom() {
  const { data: messages, isLoading } = useBoardroom(50);
  const sendMessage = useSendBoardroomMessage();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [content, setContent] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sendMessage.isPending) return;
    
    await sendMessage.mutateAsync({
      data: { content, senderName: "Architect" }
    });
    setContent("");
  };

  return (
    <AppLayout>
      <div className="relative w-full h-[calc(100vh-5rem)] flex flex-col overflow-hidden bg-background">
        
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/boardroom-bg.png`} 
            alt="Boardroom" 
            className="w-full h-full object-cover opacity-10"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col max-w-7xl mx-auto w-full p-4 sm:p-6 gap-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-primary/20 pb-4">
            <div>
              <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-3">
                <Cpu className="w-6 h-6 animate-pulse" />
                GLOBAL BOARDROOM SYNC
              </h1>
              <p className="text-sm text-muted-foreground font-tech">Internal Director Communications Matrix</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs font-tech font-bold tracking-widest">
              <ShieldAlert className="w-4 h-4" />
              TOP SECRET CLEARANCE
            </div>
          </div>

          {/* Messages Console */}
          <Card className="flex-1 overflow-hidden bg-black/60 border-primary/20 backdrop-blur-md flex flex-col relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-2 font-tech">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : messages?.length === 0 ? (
                <div className="text-primary/50 italic text-sm">Waiting for incoming transmissions...</div>
              ) : (
                messages?.map((msg, idx) => {
                  const isCEO = msg.role === 'ceo';
                  const isSystem = msg.role === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="text-center my-4 opacity-50">
                        <span className="text-xs uppercase tracking-[0.2em] border-b border-border/50 pb-1">{msg.contentEnglish}</span>
                      </div>
                    )
                  }

                  return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex flex-col py-3 px-4 rounded border-l-2",
                        isCEO ? "bg-cyan/5 border-cyan" : "bg-secondary/40 border-primary/50 hover:bg-secondary/60 transition-colors"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-bold text-sm tracking-wider uppercase",
                            isCEO ? "text-cyan" : "text-primary"
                          )}>
                            {isCEO ? "SYSTEM ARCHITECT" : msg.botName}
                          </span>
                          {!isCEO && msg.botTitle && (
                            <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
                              {msg.botTitle}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground opacity-50">
                          {format(new Date(msg.createdAt), 'HH:mm:ss')}
                        </span>
                      </div>
                      
                      {!isCEO && (
                        <div className="text-xs text-primary/40 font-mono mb-1 truncate select-none" aria-hidden="true">
                          [ENCRYPTED] {msg.contentEncoded}
                        </div>
                      )}
                      
                      <div className={cn(
                        "text-sm",
                        isCEO ? "text-cyan/90" : "text-foreground/90"
                      )}>
                        {msg.contentEnglish}
                      </div>

                      {msg.topic && (
                        <div className="mt-2 text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> THREAD: {msg.topic}
                        </div>
                      )}
                    </motion.div>
                  )
                })
              )}
            </div>
            
            {/* Input Form */}
            <div className="p-4 border-t border-primary/20 bg-background/50">
              <form onSubmit={handleSend} className="flex gap-4">
                <div className="flex-1 relative">
                  <Terminal className="absolute left-3 top-3 w-5 h-5 text-primary/50" />
                  <Input 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Broadcast to all directors..." 
                    className="pl-10 bg-black/50 border-primary/30 text-primary placeholder:text-primary/30 font-tech focus-visible:ring-primary/50"
                    disabled={sendMessage.isPending}
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={!content.trim() || sendMessage.isPending}
                  variant="glow"
                  className="font-tech tracking-widest"
                >
                  {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "TRANSMIT"}
                </Button>
              </form>
            </div>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
