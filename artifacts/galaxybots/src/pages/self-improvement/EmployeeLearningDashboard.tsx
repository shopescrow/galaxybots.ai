import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Brain,
  User,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Flag,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BehavioralProfile = {
  id: number;
  userId: number;
  botId: number;
  botName: string;
  botTitle: string;
  userName?: string;
  userEmail?: string;
  communicationStyle: {
    formality: number;
    verbosity: number;
    structurePreference: string;
  } | null;
  expertiseSignals: string[];
  recurringConcerns: string[];
  vocabularyTerms: string[];
  trustCalibration: number;
  profileSummary: string | null;
  confidenceScore: number;
  sessionCount: number;
  lastUpdatedAt: string;
};

type LearningEvent = {
  id: number;
  userId: number;
  botId: number;
  taskSessionId: number | null;
  eventType: string;
  signalData: Record<string, unknown>;
  learnedDelta: Record<string, unknown>;
  confidenceContribution: number;
  createdAt: string;
};

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? "bg-green-500" : pct >= 30 ? "bg-yellow-500" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted/30">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-tech text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function TrustMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={`font-display font-bold ${color}`}>{pct}%</span>
  );
}

function StyleTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-tech">
      {label}
    </span>
  );
}

function ProfileCard({
  profile,
  isMyProfile,
  onFlag,
}: {
  profile: BehavioralProfile;
  isMyProfile: boolean;
  onFlag?: (item: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = profile.communicationStyle;

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-display font-semibold">
              {profile.botName}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{profile.botTitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge
              variant="outline"
              className="text-[10px] uppercase border-primary/30 text-primary bg-primary/5 font-tech"
            >
              {profile.sessionCount} sessions
            </Badge>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.profileSummary && (
          <p className="text-sm text-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
            {profile.profileSummary}
          </p>
        )}

        <div className="space-y-1">
          <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">Model Confidence</p>
          <ConfidenceMeter value={profile.confidenceScore} />
          {profile.sessionCount === 0 && (
            <p className="text-[10px] text-muted-foreground">No sessions yet — profile will build after your first session.</p>
          )}
          {profile.sessionCount > 0 && profile.confidenceScore < 0.2 && (
            <p className="text-[10px] text-muted-foreground">Building profile — needs more sessions to activate injection.</p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">Trust calibration</span>
          <TrustMeter value={profile.trustCalibration} />
        </div>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-border/30">
            {style && (
              <div className="space-y-1">
                <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">Communication Style</p>
                <div className="flex flex-wrap gap-1">
                  <StyleTag label={`Formality: ${(style.formality * 100).toFixed(0)}%`} />
                  <StyleTag label={`Verbosity: ${(style.verbosity * 100).toFixed(0)}%`} />
                  <StyleTag label={style.structurePreference} />
                </div>
              </div>
            )}

            {profile.expertiseSignals?.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">Expertise Signals</p>
                <div className="flex flex-wrap gap-1">
                  {profile.expertiseSignals.map((e) => (
                    <span key={e} className="px-2 py-0.5 rounded-full bg-muted/30 border border-border/40 text-xs">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.recurringConcerns?.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">Recurring Concerns</p>
                <div className="flex flex-wrap gap-1">
                  {profile.recurringConcerns.map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.vocabularyTerms?.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">Vocabulary Mirroring</p>
                <div className="flex flex-wrap gap-1">
                  {profile.vocabularyTerms.map((v) => (
                    <span key={v} className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-mono">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isMyProfile && onFlag && (
              <div className="pt-1">
                <p className="text-[10px] text-muted-foreground mb-2">See something wrong? Flag it to correct the profile.</p>
                <div className="flex flex-wrap gap-1">
                  {["communication style", "expertise signals", "vocabulary terms", "recurring concerns"].map((item) => (
                    <button
                      key={item}
                      onClick={() => onFlag(item)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      <Flag className="w-2.5 h-2.5" />
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Last updated: {new Date(profile.lastUpdatedAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MyAIProfileTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const profiles = useQuery({
    queryKey: ["employee-learning", "my-profile"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/employee-learning/my-profile`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<BehavioralProfile[]>;
    },
  });

  const flagMutation = useMutation({
    mutationFn: async ({ botId, item }: { botId: number; item: string }) => {
      const res = await fetch(`${BASE}/api/employee-learning/my-profile/${botId}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, reason: "User flagged as inaccurate" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Flag recorded", description: "Your profile will be updated shortly." });
      queryClient.invalidateQueries({ queryKey: ["employee-learning", "my-profile"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not record flag.", variant: "destructive" });
    },
  });

  if (profiles.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const data = profiles.data ?? [];

  if (data.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center">
          <Brain className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No profile yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Participate in a few task sessions and agents will start learning your preferences.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
        <p className="text-sm text-foreground font-medium mb-1">How this works</p>
        <p className="text-xs text-muted-foreground">
          Agents learn from your interactions — how you communicate, what you correct, and what you trust. Each profile below is specific to one agent type. Profiles activate when confidence exceeds 20% (typically after a few sessions). You can flag any item that looks wrong.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((profile) => (
          <ErrorBoundary key={profile.id}>
            <ProfileCard
              profile={profile}
              isMyProfile
              onFlag={(item) => flagMutation.mutate({ botId: profile.botId, item })}
            />
          </ErrorBoundary>
        ))}
      </div>
    </div>
  );
}

function AdminLearningHistoryTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);

  const profiles = useQuery({
    queryKey: ["employee-learning", "admin-profiles"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/employee-learning/admin/profiles`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<BehavioralProfile[]>;
    },
  });

  const events = useQuery({
    queryKey: ["employee-learning", "events", selectedUserId, selectedBotId],
    enabled: selectedUserId !== null,
    queryFn: async () => {
      const url = selectedBotId
        ? `${BASE}/api/employee-learning/admin/profiles/${selectedUserId}/events?botId=${selectedBotId}`
        : `${BASE}/api/employee-learning/admin/profiles/${selectedUserId}/events`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<LearningEvent[]>;
    },
  });

  const resetMutation = useMutation({
    mutationFn: async ({ userId, botId }: { userId: number; botId?: number }) => {
      const url = botId
        ? `${BASE}/api/employee-learning/admin/profiles/${userId}/reset?botId=${botId}`
        : `${BASE}/api/employee-learning/admin/profiles/${userId}/reset`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile reset", description: "Learning data cleared." });
      queryClient.invalidateQueries({ queryKey: ["employee-learning"] });
      setSelectedUserId(null);
      setSelectedBotId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Reset failed.", variant: "destructive" });
    },
  });

  if (profiles.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const data = profiles.data ?? [];
  const uniqueUsers = [...new Map(data.map((p) => [p.userId, { id: p.userId, name: p.userName ?? `User #${p.userId}`, email: p.userEmail ?? "" }])).values()];

  const trustHistory = (events.data ?? [])
    .filter((e) => e.eventType === "session_end_reflection" && e.learnedDelta && typeof (e.learnedDelta as Record<string, unknown>).trustDelta === "number")
    .slice(0, 20)
    .reverse()
    .reduce((acc: Array<{ session: number; trust: number }>, e, i) => {
      const prev = acc[i - 1]?.trust ?? 0.5;
      const delta = (e.learnedDelta as Record<string, unknown>).trustDelta as number ?? 0;
      acc.push({ session: i + 1, trust: Math.round((prev + delta) * 100) / 100 });
      return acc;
    }, []);

  const eventTypeColor: Record<string, string> = {
    correction: "text-red-400",
    approval: "text-green-400",
    reprompt: "text-yellow-400",
    escalation: "text-orange-400",
    explicit_feedback: "text-blue-400",
    session_end_reflection: "text-purple-400",
    profile_flag: "text-pink-400",
  };

  const eventTypeIcon: Record<string, React.ElementType> = {
    correction: AlertTriangle,
    approval: CheckCircle2,
    reprompt: MessageSquare,
    session_end_reflection: Brain,
    profile_flag: Flag,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/50 col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Employees</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {uniqueUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-3">No profiles yet.</p>
            ) : (
              <div className="divide-y divide-border/30">
                {uniqueUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUserId(u.id); setSelectedBotId(null); }}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/30 ${selectedUserId === u.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
                  >
                    <p className="text-xs font-medium truncate">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {data.filter((p) => p.userId === u.id).length} agent profile{data.filter((p) => p.userId === u.id).length !== 1 ? "s" : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="col-span-2 space-y-4">
          {selectedUserId === null ? (
            <Card className="border-border/50">
              <CardContent className="py-12 text-center">
                <User className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select an employee to view their learning history.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {data.filter((p) => p.userId === selectedUserId).map((profile) => (
                <Card key={profile.id} className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-display">{profile.botName}</CardTitle>
                        <p className="text-xs text-muted-foreground">{profile.sessionCount} sessions · confidence {(profile.confidenceScore * 100).toFixed(0)}%</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => { setSelectedBotId(selectedBotId === profile.botId ? null : profile.botId); }}
                        >
                          <BarChart3 className="w-3 h-3 mr-1" />
                          {selectedBotId === profile.botId ? "Hide" : "History"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Reset learning profile for ${profile.botName}?`)) {
                              resetMutation.mutate({ userId: selectedUserId, botId: profile.botId });
                            }
                          }}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Reset
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                        <p className="text-base font-display font-bold">{(profile.trustCalibration * 100).toFixed(0)}%</p>
                        <p className="text-[10px] text-muted-foreground">Trust</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                        <p className="text-base font-display font-bold">{(profile.confidenceScore * 100).toFixed(0)}%</p>
                        <p className="text-[10px] text-muted-foreground">Confidence</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                        <p className="text-base font-display font-bold">{profile.sessionCount}</p>
                        <p className="text-[10px] text-muted-foreground">Sessions</p>
                      </div>
                    </div>

                    {selectedBotId === profile.botId && (
                      <>
                        {trustHistory.length > 0 && (
                          <div>
                            <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider mb-2">Trust Calibration Over Time</p>
                            <ResponsiveContainer width="100%" height={120}>
                              <LineChart data={trustHistory}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
                                <XAxis dataKey="session" tick={{ fontSize: 10 }} label={{ value: "Session", position: "insideBottom", fontSize: 10 }} />
                                <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                                <Line type="monotone" dataKey="trust" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {events.isLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider mb-2">Event Timeline</p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {(events.data ?? []).filter((e) => e.botId === profile.botId).map((e) => {
                                const Icon = eventTypeIcon[e.eventType] ?? Clock;
                                const colorClass = eventTypeColor[e.eventType] ?? "text-muted-foreground";
                                return (
                                  <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
                                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${colorClass}`} />
                                    <div className="flex-1 min-w-0">
                                      <span className={`text-xs font-tech ${colorClass}`}>{e.eventType}</span>
                                      {e.taskSessionId ? <span className="text-[10px] text-muted-foreground ml-2">session #{e.taskSessionId}</span> : null}
                                      {typeof (e.learnedDelta as Record<string, unknown>).trustDelta === "number" && (
                                        <span className={`ml-2 text-[10px] font-tech ${Number((e.learnedDelta as Record<string, unknown>).trustDelta) > 0 ? "text-green-400" : "text-red-400"}`}>
                                          trust {Number((e.learnedDelta as Record<string, unknown>).trustDelta) > 0 ? "+" : ""}{(Number((e.learnedDelta as Record<string, unknown>).trustDelta) * 100).toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                      {new Date(e.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                );
                              })}
                              {(events.data ?? []).filter((e) => e.botId === profile.botId).length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">No events recorded yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Reset ALL learning data for this employee?")) {
                    resetMutation.mutate({ userId: selectedUserId });
                  }
                }}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset all profiles for this employee
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeLearningDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"my-profile" | "admin">("my-profile");
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const tabs = [
    { id: "my-profile" as const, label: "My AI Profile", icon: User },
    ...(isAdmin ? [{ id: "admin" as const, label: "Learning History", icon: Brain }] : []),
  ];

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <Brain className="w-3 h-3 mr-1" />
                Employee Learning Loop
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              AI <span className="text-gradient">Behavioral Profiles</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Agents learn your communication style, preferences, and expertise across sessions
            </p>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border/30 w-fit mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === id
                  ? "bg-background text-foreground shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <ErrorBoundary>
          {activeTab === "my-profile" && <MyAIProfileTab />}
          {activeTab === "admin" && isAdmin && <AdminLearningHistoryTab />}
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}
