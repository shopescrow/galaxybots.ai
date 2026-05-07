import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTaskSessions } from "@/hooks/use-task-sessions";
import { MissionDebrief } from "@/components/task-sessions/MissionDebrief";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import {
  Loader2,
  Rocket,
  Users,
  MessageSquare,
  Plus,
  Target,
  Clock,
  FileBarChart,
  X,
  Search,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { AssignmentsPanel } from "@/components/memory/AssignmentsPanel";

export default function TaskSessions() {
  const { data: sessions, isLoading } = useTaskSessions();
  const [debriefSessionId, setDebriefSessionId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) =>
      (s.objective ?? "").toLowerCase().includes(q) ||
      (s.status ?? "").toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  return (
    <AppLayout>
      <div className="relative w-full min-h-[calc(100vh-5rem)] bg-background">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary flex items-center gap-3">
                <Rocket className="w-7 h-7 sm:w-8 sm:h-8" />
                Task Rooms
              </h1>
              <p className="text-muted-foreground mt-1 font-tech text-sm">
                All cross-functional task sessions — click any room to re-enter.
              </p>
            </div>
            <Link href="/deploy-team">
              <Button variant="glow" className="font-tech tracking-wider">
                <Plus className="w-4 h-4 mr-2" />
                New Room
              </Button>
            </Link>
          </div>

          <div className="mb-6">
            <AssignmentsPanel />
          </div>

          {/* Search bar */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by objective or keyword..."
              className="pl-9 bg-black/30 border-primary/20 font-tech text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Debrief panel */}
          <AnimatePresence>
            {debriefSessionId !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 overflow-hidden"
              >
                <Card className="p-6 bg-black/40 border-primary/20">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-tech font-bold text-primary flex items-center gap-2">
                      <FileBarChart className="w-5 h-5" />
                      Mission Debrief
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDebriefSessionId(null)}
                      className="text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <MissionDebrief sessionId={debriefSessionId} />
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <Card className="p-12 bg-black/30 border-primary/20 text-center">
              <Target className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <h3 className="text-lg font-tech font-bold text-foreground mb-2">
                No Task Rooms Yet
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Deploy your first cross-functional bot team to tackle a business objective.
              </p>
              <Link href="/deploy-team">
                <Button variant="glow" className="font-tech">
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Your First Team
                </Button>
              </Link>
            </Card>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground font-tech">
              No task rooms match "{searchQuery}"
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {searchQuery && (
                <p className="text-xs font-tech text-muted-foreground -mb-2">
                  {filteredSessions.length} result{filteredSessions.length !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
              )}
              {filteredSessions.map((session, idx) => {
                const teamBots = (session as { teamBots?: Array<{ id: number; name: string }> }).teamBots ?? [];
                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    <Card className="p-5 bg-black/30 border-primary/20 hover:border-primary/50 hover:bg-black/40 transition-all group">
                      <div className="flex items-start justify-between gap-4">
                        <Link href={`/task-rooms/${session.id}`} className="flex-1 min-w-0 cursor-pointer">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                session.status === "active"
                                  ? "text-green-400 border-green-500/30"
                                  : "text-muted-foreground border-border"
                              }`}
                            >
                              {session.status?.toUpperCase()}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-tech flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(session.createdAt), "MMM d, yyyy · HH:mm")}
                            </span>
                          </div>
                          <h3 className="font-tech font-bold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2">
                            {session.objective}
                          </h3>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {teamBots.length} specialist{teamBots.length !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {teamBots.slice(0, 3).map((b) => b.name.split(" ")[0]).join(", ")}
                              {teamBots.length > 3 ? ` +${teamBots.length - 3}` : ""}
                            </span>
                          </div>
                        </Link>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <Link href={`/task-rooms/${session.id}`}>
                            <Button
                              variant="glow"
                              size="sm"
                              className="text-xs font-tech h-8 px-3"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Re-Enter Room
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs font-tech h-7 px-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDebriefSessionId(
                                debriefSessionId === session.id ? null : session.id
                              );
                            }}
                          >
                            <FileBarChart className="w-3 h-3 mr-1" />
                            Debrief
                          </Button>

                          <div className="flex -space-x-2">
                            {teamBots.slice(0, 4).map((bot) => (
                              <div
                                key={bot.id}
                                className="w-7 h-7 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[9px] font-bold text-primary"
                                title={bot.name}
                              >
                                {bot.name
                                  .split(" ")
                                  .map((w) => w[0])
                                  .join("")
                                  .substring(0, 2)}
                              </div>
                            ))}
                            {teamBots.length > 4 && (
                              <div className="w-7 h-7 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                +{teamBots.length - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
