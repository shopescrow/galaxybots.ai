import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Search, Database, PenLine, Globe, Users, Loader2 } from "lucide-react";
import type { AgenticEvent } from "@/hooks/use-sse";

const toolIcons: Record<string, typeof Search> = {
  web_search: Globe,
  read_world_state: Database,
  write_world_state: PenLine,
  read_platform_data: Search,
  delegate_to_bot: Users,
};

const toolLabels: Record<string, string> = {
  web_search: "Web Search",
  read_world_state: "Read State",
  write_world_state: "Write State",
  read_platform_data: "Query Data",
  delegate_to_bot: "Delegate",
};

function ToolStepCard({ event, paired }: { event: AgenticEvent; paired?: AgenticEvent }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[event.toolName || ""] || Search;
  const label = toolLabels[event.toolName || ""] || event.toolName || "Tool";

  const inputStr = event.input ? JSON.stringify(event.input, null, 2) : "";
  const outputStr = paired?.output ? JSON.stringify(paired.output, null, 2) : "";
  const hasResult = !!paired;

  return (
    <div className="border border-primary/20 rounded-md bg-black/20 overflow-hidden text-xs font-tech">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-primary/60 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-primary/60 flex-shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-primary font-bold uppercase tracking-wider">{label}</span>
        {!hasResult && (
          <Loader2 className="w-3 h-3 animate-spin text-primary/50 ml-auto" />
        )}
        {hasResult && (
          <span className="ml-auto text-green-400/70 text-[10px]">done</span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-primary/10">
          {inputStr && (
            <div className="mt-1.5">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Input</span>
              <pre className="mt-0.5 p-1.5 rounded bg-black/30 text-foreground/70 overflow-x-auto max-h-24 text-[11px] leading-tight">{inputStr}</pre>
            </div>
          )}
          {outputStr && (
            <div>
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Result</span>
              <pre className="mt-0.5 p-1.5 rounded bg-black/30 text-foreground/70 overflow-x-auto max-h-32 text-[11px] leading-tight">{outputStr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolStepsDisplay({ events }: { events: AgenticEvent[] }) {
  const toolCalls = events.filter((e) => e.type === "tool_call");

  if (toolCalls.length === 0) return null;

  return (
    <div className="space-y-1">
      {toolCalls.map((call, idx) => {
        const paired = events.find(
          (e) => e.type === "tool_result" && e.toolCallId === call.toolCallId,
        );
        return <ToolStepCard key={idx} event={call} paired={paired} />;
      })}
    </div>
  );
}

export function WorkingIndicator({ botName }: { botName?: string }) {
  return (
    <div className="flex items-center gap-2 text-primary/50 py-2">
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "200ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "400ms" }} />
      </div>
      <span className="text-sm font-tech">
        {botName ? `${botName} is working...` : "Processing..."}
      </span>
    </div>
  );
}

export function MessageToolSteps({ toolData, messageType }: { toolData: unknown; messageType: string }) {
  if (messageType !== "tool_call" && messageType !== "tool_result") return null;

  const data = toolData as Record<string, unknown> | null;
  if (!data) return null;

  const [expanded, setExpanded] = useState(false);
  const toolName = (data.toolName as string) || "Tool";
  const Icon = toolIcons[toolName] || Search;
  const label = toolLabels[toolName] || toolName;

  return (
    <div className="border border-primary/15 rounded bg-black/15 overflow-hidden text-xs font-tech">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-primary/5 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-primary/50" />
        ) : (
          <ChevronRight className="w-3 h-3 text-primary/50" />
        )}
        <Icon className="w-3 h-3 text-primary/70" />
        <span className="text-primary/80 font-bold uppercase tracking-wider text-[10px]">
          {messageType === "tool_call" ? `Called: ${label}` : `Result: ${label}`}
        </span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-1.5 border-t border-primary/10">
          {data.input && (
            <div className="mt-1">
              <span className="text-muted-foreground text-[10px]">Input</span>
              <pre className="p-1 rounded bg-black/20 text-foreground/60 overflow-x-auto max-h-20 text-[10px]">
                {JSON.stringify(data.input, null, 2)}
              </pre>
            </div>
          )}
          {data.output && (
            <div className="mt-1">
              <span className="text-muted-foreground text-[10px]">Output</span>
              <pre className="p-1 rounded bg-black/20 text-foreground/60 overflow-x-auto max-h-24 text-[10px]">
                {JSON.stringify(data.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
