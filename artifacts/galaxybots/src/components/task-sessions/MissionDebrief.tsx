import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTaskSession, useTaskSessionMessages } from "@/hooks/use-task-sessions";
import {
  Loader2,
  Users,
  Wrench,
  MessageSquare,
  UserPlus,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface ToolDataPayload {
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

interface SessionMessage {
  id: number;
  sessionId: number;
  botId?: number | null;
  botName?: string | null;
  botTitle?: string | null;
  role: string;
  content: string;
  messageType?: string;
  toolData?: ToolDataPayload | null;
  flaggedRoles?: string[];
  createdAt: string;
}

export function MissionDebrief({ sessionId }: { sessionId: number }) {
  const { data: session, isLoading: sessionLoading } = useTaskSession(sessionId);
  const { data: rawMessages, isLoading: messagesLoading } = useTaskSessionMessages(sessionId);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const messages = (rawMessages ?? []) as SessionMessage[];

  if (sessionLoading || messagesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-8 text-muted-foreground font-tech">
        Session not found.
      </div>
    );
  }

  const teamBots = (session as { teamBots?: Array<{ id: number; name: string; title: string; department: string }> }).teamBots ?? [];

  const toolCallMessages = messages.filter(
    (m) => m.messageType === "tool_call" || m.messageType === "tool_result"
  );
  const textMessages = messages.filter((m) => m.messageType === "text" || !m.messageType);
  const userMessages = textMessages.filter((m) => m.role === "user");
  const botMessages = textMessages.filter((m) => m.role === "bot");

  const botsInvolved = new Map<number, { name: string; title: string; messageCount: number }>();
  for (const msg of messages) {
    if (msg.botId && msg.botName && msg.role === "bot") {
      const existing = botsInvolved.get(msg.botId);
      if (existing) {
        existing.messageCount++;
      } else {
        botsInvolved.set(msg.botId, {
          name: msg.botName,
          title: msg.botTitle || "",
          messageCount: 1,
        });
      }
    }
  }

  const flaggedRoles = new Set<string>();
  for (const msg of messages) {
    const fr = (msg as { flaggedRoles?: string[] }).flaggedRoles;
    if (fr) {
      for (const r of fr) flaggedRoles.add(r);
    }
  }

  const midSessionAdditions = teamBots.filter(
    (bot) => !botsInvolved.has(bot.id) || false
  );

  const toggleTool = (id: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toolPairs: Array<{
    callMsg: SessionMessage;
    resultMsg?: SessionMessage;
  }> = [];
  const usedResultIds = new Set<number>();
  for (const callMsg of toolCallMessages.filter((m) => m.messageType === "tool_call")) {
    const callId = callMsg.toolData?.toolCallId;
    const resultMsg = callId
      ? toolCallMessages.find(
          (m) =>
            m.messageType === "tool_result" &&
            m.toolData?.toolCallId === callId &&
            !usedResultIds.has(m.id)
        )
      : undefined;
    if (resultMsg) usedResultIds.add(resultMsg.id);
    toolPairs.push({ callMsg, resultMsg });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-black/30 border-primary/20 text-center">
          <Users className="w-5 h-5 text-primary mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-foreground">{botsInvolved.size}</div>
          <div className="text-[10px] font-tech text-muted-foreground uppercase">Bots Active</div>
        </Card>
        <Card className="p-4 bg-black/30 border-primary/20 text-center">
          <Wrench className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-foreground">{toolPairs.length}</div>
          <div className="text-[10px] font-tech text-muted-foreground uppercase">Tool Calls</div>
        </Card>
        <Card className="p-4 bg-black/30 border-primary/20 text-center">
          <MessageSquare className="w-5 h-5 text-cyan mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-foreground">{textMessages.length}</div>
          <div className="text-[10px] font-tech text-muted-foreground uppercase">Messages</div>
        </Card>
        <Card className="p-4 bg-black/30 border-primary/20 text-center">
          <UserPlus className="w-5 h-5 text-green-400 mx-auto mb-2" />
          <div className="text-2xl font-display font-bold text-foreground">{flaggedRoles.size}</div>
          <div className="text-[10px] font-tech text-muted-foreground uppercase">Roles Flagged</div>
        </Card>
      </div>

      <Card className="p-5 bg-black/30 border-primary/20">
        <h3 className="font-tech font-bold text-primary text-sm mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" />
          TEAM ROSTER
        </h3>
        <div className="space-y-2">
          {[...botsInvolved.entries()].map(([botId, info]) => (
            <div
              key={botId}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                  {info.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .substring(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-tech font-bold">{info.name}</p>
                  <p className="text-[10px] text-muted-foreground">{info.title}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {info.messageCount} msgs
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {flaggedRoles.size > 0 && (
        <Card className="p-5 bg-yellow-500/5 border-yellow-500/20">
          <h3 className="font-tech font-bold text-yellow-400 text-sm mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            MID-SESSION ROLE REQUESTS
          </h3>
          <div className="flex flex-wrap gap-2">
            {[...flaggedRoles].map((role) => (
              <Badge
                key={role}
                variant="outline"
                className="text-xs text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
              >
                {role}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {toolPairs.length > 0 && (
        <Card className="p-5 bg-black/30 border-primary/20">
          <h3 className="font-tech font-bold text-primary text-sm mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            TOOL EXECUTION LOG
          </h3>
          <div className="space-y-2">
            {toolPairs.map(({ callMsg, resultMsg }, idx) => {
              const isExpanded = expandedTools.has(idx);
              const toolName = callMsg.toolData?.toolName || "unknown";
              return (
                <div key={idx} className="rounded-lg border border-border/30 overflow-hidden">
                  <button
                    onClick={() => toggleTool(idx)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {toolName}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-tech">
                        by {callMsg.botName || "unknown"}
                      </span>
                      {resultMsg && (
                        <Badge variant="secondary" className="text-[10px] text-green-400">
                          completed
                        </Badge>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {callMsg.toolData?.input && (
                        <div>
                          <p className="text-[10px] font-tech text-muted-foreground uppercase mb-1">
                            Input
                          </p>
                          <pre className="text-xs bg-black/50 rounded p-2 overflow-x-auto text-foreground/80 font-mono">
                            {JSON.stringify(callMsg.toolData.input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {resultMsg?.toolData?.output && (
                        <div>
                          <p className="text-[10px] font-tech text-muted-foreground uppercase mb-1">
                            Output
                          </p>
                          <pre className="text-xs bg-black/50 rounded p-2 overflow-x-auto text-foreground/80 font-mono max-h-48 overflow-y-auto">
                            {typeof resultMsg.toolData.output === "string"
                              ? resultMsg.toolData.output
                              : JSON.stringify(resultMsg.toolData.output, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-5 bg-black/30 border-primary/20">
        <h3 className="font-tech font-bold text-primary text-sm mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          SESSION TRANSCRIPT ({textMessages.length} messages)
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {textMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg border-l-2 ${
                msg.role === "user"
                  ? "bg-cyan/5 border-cyan"
                  : "bg-secondary/30 border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`font-tech font-bold text-xs uppercase tracking-wider ${
                    msg.role === "user" ? "text-cyan" : "text-primary"
                  }`}
                >
                  {msg.role === "user" ? "ARCHITECT" : msg.botName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(msg.createdAt), "HH:mm:ss")}
                </span>
              </div>
              <p className="text-sm text-foreground/80 line-clamp-4">{msg.content}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
