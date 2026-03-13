import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBotMemories, useDeleteMemoryMutation } from "@/hooks/use-memory";
import { Loader2, Brain, Trash2, Calendar, Tag } from "lucide-react";
import { format } from "date-fns";

interface MemoryAuditProps {
  botId: number;
  botName: string;
}

export function MemoryAudit({ botId, botName }: MemoryAuditProps) {
  const { data: memories, isLoading } = useBotMemories(botId);
  const deleteMutation = useDeleteMemoryMutation();

  const handleDelete = async (memoryId: number) => {
    await deleteMutation.mutateAsync({ id: memoryId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!memories || memories.length === 0) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-8 text-center">
          <Brain className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-tech font-bold text-foreground mb-2">No Memories Yet</h3>
          <p className="text-sm text-muted-foreground">
            {botName} hasn't built any long-term memories yet. Memories are created from task session consolidations and key interactions.
          </p>
        </CardContent>
      </Card>
    );
  }

  const groupedByTopic: Record<string, typeof memories> = {};
  for (const memory of memories) {
    const topic = memory.topic || "General";
    if (!groupedByTopic[topic]) groupedByTopic[topic] = [];
    groupedByTopic[topic].push(memory);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-tech font-bold text-foreground">
            Memory Bank ({memories.length} memories)
          </h3>
        </div>
      </div>

      {Object.entries(groupedByTopic).map(([topic, topicMemories]) => (
        <Card key={topic} className="border-primary/20">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-tech flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              {topic}
              <Badge variant="outline" className="text-[10px] ml-auto">
                {topicMemories.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {topicMemories.map((memory) => (
              <div
                key={memory.id}
                className="p-3 rounded-lg bg-secondary/50 border border-border/30 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground/90 leading-relaxed flex-1">
                    {memory.summary}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(memory.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(memory.createdAt), "MMM d, yyyy")}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {memory.sourceType}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
