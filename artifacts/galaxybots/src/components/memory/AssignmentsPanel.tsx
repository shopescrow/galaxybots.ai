import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useBotAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useRunAssignment,
  useBackgroundReports,
} from "@/hooks/use-memory";
import { useBots } from "@/hooks/use-bots";
import { useState } from "react";
import {
  Loader2,
  Eye,
  Plus,
  Trash2,
  Play,
  Clock,
  FileText,
  Bot as BotIcon,
} from "lucide-react";
import { format } from "date-fns";

export function AssignmentsPanel() {
  const { data: assignments, isLoading: assignmentsLoading } = useBotAssignments();
  const { data: reports } = useBackgroundReports(undefined, 10);
  const { data: bots } = useBots();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const runAssignment = useRunAssignment();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<number>(0);
  const [objective, setObjective] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [expandedReport, setExpandedReport] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!selectedBotId || !objective.trim()) return;
    await createAssignment.mutateAsync({
      data: { botId: selectedBotId, objective, schedule },
    });
    setObjective("");
    setSelectedBotId(0);
    setShowCreate(false);
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-tech flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Active Watch Assignments
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Assign
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {showCreate && (
            <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border/30 space-y-3">
              <select
                className="w-full p-2 rounded bg-background border border-border text-sm"
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(Number(e.target.value))}
              >
                <option value={0}>Select a bot...</option>
                {bots?.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name} - {bot.title}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Standing objective (e.g., Monitor market conditions)"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="text-sm"
              />
              <div className="flex items-center gap-2">
                <select
                  className="p-2 rounded bg-background border border-border text-sm"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <Button
                  size="sm"
                  variant="glow"
                  onClick={handleCreate}
                  disabled={!selectedBotId || !objective.trim() || createAssignment.isPending}
                  className="text-xs"
                >
                  {createAssignment.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Create Assignment"
                  )}
                </Button>
              </div>
            </div>
          )}

          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : !assignments || assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active assignments. Assign bots to monitor objectives autonomously.
            </p>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="p-3 rounded-lg bg-secondary/30 border border-border/20 flex items-start gap-3"
                >
                  <BotIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-tech font-medium truncate">
                        {assignment.botName}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {assignment.schedule}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          assignment.isActive === "true"
                            ? "text-green-400 border-green-500/30"
                            : "text-muted-foreground"
                        }`}
                      >
                        {assignment.isActive === "true" ? "ACTIVE" : "PAUSED"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{assignment.objective}</p>
                    {assignment.lastRunAt && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last run: {format(new Date(assignment.lastRunAt), "MMM d, HH:mm")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => runAssignment.mutateAsync({ id: assignment.id })}
                      disabled={runAssignment.isPending}
                      title="Run now"
                    >
                      {runAssignment.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-green-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={() => deleteAssignment.mutateAsync({ id: assignment.id })}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {reports && reports.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-tech flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Recent Background Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-3 rounded-lg bg-secondary/30 border border-border/20 cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() =>
                  setExpandedReport(expandedReport === report.id ? null : report.id)
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <BotIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-tech font-medium">{report.botName}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {format(new Date(report.createdAt), "MMM d, HH:mm")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{report.summary}</p>
                {expandedReport === report.id && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                      {report.content}
                    </p>
                    {report.objective && (
                      <p className="text-[10px] text-muted-foreground/70 mt-2">
                        Objective: {report.objective}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
