import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  useBotAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useRunAssignment,
  useUpdateAssignment,
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
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";

function RunStatusBadge({ status }: { status: string }) {
  if (status === "failed") {
    return (
      <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30 gap-1">
        <XCircle className="w-3 h-3" />
        FAILED
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/30 gap-1">
        <AlertTriangle className="w-3 h-3" />
        PARTIAL
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/30 gap-1">
      <CheckCircle2 className="w-3 h-3" />
      SUCCESS
    </Badge>
  );
}

export function AssignmentsPanel() {
  const { data: assignments, isLoading: assignmentsLoading } = useBotAssignments();
  const { data: reports } = useBackgroundReports(undefined, 10);
  const { data: bots } = useBots();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const runAssignment = useRunAssignment();
  const updateAssignment = useUpdateAssignment();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<number>(0);
  const [objective, setObjective] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [actionMode, setActionMode] = useState<"passive" | "active">("passive");
  const [actionPrompt, setActionPrompt] = useState("");
  const [expandedReport, setExpandedReport] = useState<number | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!selectedBotId || !objective.trim()) return;
    await createAssignment.mutateAsync({
      data: {
        botId: selectedBotId,
        objective,
        schedule,
        actionMode,
        actionPrompt: actionMode === "active" ? actionPrompt || undefined : undefined,
      },
    });
    setObjective("");
    setSelectedBotId(0);
    setActionMode("passive");
    setActionPrompt("");
    setShowCreate(false);
  };

  const handleToggleMode = async (assignmentId: number, currentMode: string) => {
    const newMode = currentMode === "active" ? "passive" : "active";
    await updateAssignment.mutateAsync({
      id: assignmentId,
      data: { actionMode: newMode },
    });
  };

  const handleUpdate = async (assignmentId: number, updates: { actionPrompt?: string; schedule?: string }) => {
    await updateAssignment.mutateAsync({
      id: assignmentId,
      data: updates,
    });
  };

  const failedReports = reports?.filter((r) => r.runStatus === "failed" || r.runStatus === "partial") ?? [];

  return (
    <div className="space-y-4">
      {failedReports.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-tech flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              Recent Alerts ({failedReports.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {failedReports.slice(0, 3).map((report) => (
              <div
                key={report.id}
                className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2"
              >
                <RunStatusBadge status={report.runStatus} />
                <span className="text-xs font-tech font-medium">{report.botName}</span>
                <span className="text-[10px] text-muted-foreground truncate flex-1">{report.summary}</span>
                <span className="text-[10px] text-muted-foreground/70 shrink-0">
                  {format(new Date(report.createdAt), "MMM d, HH:mm")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                {bots?.data?.map((bot) => (
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
              <div className="flex items-center gap-3">
                <select
                  className="p-2 rounded bg-background border border-border text-sm"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Passive</span>
                  <Switch
                    checked={actionMode === "active"}
                    onCheckedChange={(checked) => setActionMode(checked ? "active" : "passive")}
                  />
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    Active
                  </span>
                </div>
              </div>
              {actionMode === "active" && (
                <Textarea
                  placeholder="Standing order instruction (e.g., Review expenses and post a Slack summary flagging anomalies)"
                  value={actionPrompt}
                  onChange={(e) => setActionPrompt(e.target.value)}
                  className="text-sm min-h-[80px]"
                />
              )}
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
                  className="p-3 rounded-lg bg-secondary/30 border border-border/20"
                >
                  <div className="flex items-start gap-3">
                    <BotIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                        <Badge
                          variant="outline"
                          className={`text-[10px] gap-1 ${
                            assignment.actionMode === "active"
                              ? "text-yellow-400 border-yellow-500/30"
                              : "text-muted-foreground"
                          }`}
                        >
                          {assignment.actionMode === "active" ? (
                            <><Zap className="w-2.5 h-2.5" /> EXECUTE</>
                          ) : (
                            <><Eye className="w-2.5 h-2.5" /> BRIEFING</>
                          )}
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
                        onClick={() => setExpandedOrder(expandedOrder === assignment.id ? null : assignment.id)}
                        title="Standing orders"
                      >
                        {expandedOrder === assignment.id ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </Button>
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

                  {expandedOrder === assignment.id && (
                    <StandingOrderEditor
                      assignmentId={assignment.id}
                      actionMode={assignment.actionMode}
                      actionPrompt={assignment.actionPrompt ?? ""}
                      schedule={assignment.schedule}
                      onToggleMode={() => handleToggleMode(assignment.id, assignment.actionMode)}
                      onUpdate={(updates) => handleUpdate(assignment.id, updates)}
                      isPending={updateAssignment.isPending}
                    />
                  )}
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
                  <RunStatusBadge status={report.runStatus} />
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

function StandingOrderEditor({
  assignmentId,
  actionMode,
  actionPrompt,
  schedule,
  onToggleMode,
  onUpdate,
  isPending,
}: {
  assignmentId: number;
  actionMode: string;
  actionPrompt: string;
  schedule: string;
  onToggleMode: () => void;
  onUpdate: (updates: { actionPrompt?: string; schedule?: string }) => void;
  isPending: boolean;
}) {
  const [editPrompt, setEditPrompt] = useState(actionPrompt);
  const [editSchedule, setEditSchedule] = useState(schedule);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-tech text-muted-foreground">Standing Order Configuration</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Passive Briefing</span>
          <Switch
            checked={actionMode === "active"}
            onCheckedChange={onToggleMode}
            disabled={isPending}
          />
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 text-yellow-400" />
            Active Execution
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Schedule:</span>
        <select
          className="p-1.5 rounded bg-background border border-border text-xs"
          value={editSchedule}
          onChange={(e) => {
            setEditSchedule(e.target.value);
            setDirty(true);
          }}
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      {actionMode === "active" && (
        <div className="space-y-2">
          <Textarea
            placeholder="Standing order instruction for this bot..."
            value={editPrompt}
            onChange={(e) => {
              setEditPrompt(e.target.value);
              setDirty(true);
            }}
            className="text-sm min-h-[60px]"
          />
        </div>
      )}
      {dirty && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => {
            const updates: { actionPrompt?: string; schedule?: string } = {};
            if (editPrompt !== actionPrompt) updates.actionPrompt = editPrompt;
            if (editSchedule !== schedule) updates.schedule = editSchedule;
            onUpdate(updates);
            setDirty(false);
          }}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Changes"}
        </Button>
      )}
    </div>
  );
}
