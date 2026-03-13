import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTaskSessions } from "@/hooks/use-task-sessions";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Loader2,
  Rocket,
  Users,
  MessageSquare,
  Plus,
  Target,
  Clock,
} from "lucide-react";

export default function TaskSessions() {
  const { data: sessions, isLoading } = useTaskSessions();

  return (
    <AppLayout>
      <div className="relative w-full min-h-[calc(100vh-5rem)] bg-background">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-3">
                <Rocket className="w-8 h-8" />
                Task Rooms
              </h1>
              <p className="text-muted-foreground mt-2 font-tech">
                Cross-functional task sessions with deployed bot teams.
              </p>
            </div>
            <Link href="/deploy-team">
              <Button variant="glow" className="font-tech tracking-wider">
                <Plus className="w-4 h-4 mr-2" />
                Deploy Team
              </Button>
            </Link>
          </div>

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
                Deploy your first cross-functional bot team to tackle a business
                objective.
              </p>
              <Link href="/deploy-team">
                <Button variant="glow" className="font-tech">
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Your First Team
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sessions.map((session, idx) => {
                const teamBots = (session as { teamBots?: Array<{ id: number; name: string }> }).teamBots ?? [];
                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Link href={`/task-rooms/${session.id}`}>
                      <Card className="p-5 bg-black/30 border-primary/20 hover:border-primary/40 hover:bg-black/40 transition-all cursor-pointer group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
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
                                <Clock className="w-3 h-3" />
                                {format(
                                  new Date(session.createdAt),
                                  "MMM d, yyyy HH:mm",
                                )}
                              </span>
                            </div>
                            <h3 className="font-tech font-bold text-foreground group-hover:text-primary transition-colors mb-2">
                              {session.objective}
                            </h3>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {teamBots.length} specialists
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                Active session
                              </span>
                            </div>
                          </div>

                          <div className="flex -space-x-2 flex-shrink-0">
                            {teamBots.slice(0, 4).map((bot) => (
                              <div
                                key={bot.id}
                                className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary"
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
                              <div className="w-8 h-8 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                +{teamBots.length - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    </Link>
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
