import { useState, useEffect, useCallback } from "react";
  import { useAuth } from "@/contexts/AuthContext";
  import { useLocation } from "wouter";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Check, ChevronRight, Sparkles, Building2, Loader2 } from "lucide-react";

  interface Bot {
    id: number;
    name: string;
    title?: string | null;
    category?: string | null;
  }

  const PLAN_CONFIG = {
    single: {
      name: "Single Director",
      botLimit: 1,
      selectionLabel: "Appoint Your Director",
      selectionNote: "Choose the one executive who will command your AI operation.",
      ctaLabel: "Launch My Director",
      textColor: "text-cyan-400",
      borderSelected: "border-cyan-500/60",
      bgSelected: "bg-cyan-500/10",
      shadowSelected: "shadow-[0_0_24px_rgba(34,211,238,0.25)]",
      glowBg: "bg-cyan-500",
      badgeClasses: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
      progressBar: "bg-cyan-500",
      features: [
        "1 Director-Level AI Executive",
        "Unlimited Conversations",
        "Semantic Memory & Context",
        "Full Task Execution Suite",
        "Email Support",
      ],
    },
    team: {
      name: "Department Team",
      botLimit: 5,
      selectionLabel: "Appoint Your 5 Directors",
      selectionNote: "Choose the executives who will run your AI company. You can change this anytime.",
      ctaLabel: "Launch My Team",
      textColor: "text-purple-400",
      borderSelected: "border-purple-500/60",
      bgSelected: "bg-purple-500/10",
      shadowSelected: "shadow-[0_0_24px_rgba(168,85,247,0.25)]",
      glowBg: "bg-purple-500",
      badgeClasses: "bg-purple-500/10 border-purple-500/30 text-purple-400",
      progressBar: "bg-purple-500",
      features: [
        "5 Director-Level AI Executives",
        "Boardroom Command Centre",
        "Shared Memory Across Your Team",
        "Task Rooms & Agentic Loops",
        "ROI Dashboards",
        "Priority Support",
      ],
    },
    enterprise: {
      name: "Enterprise Command",
      botLimit: Infinity,
      selectionLabel: "Your Full Executive Roster",
      selectionNote: "You have unlimited access to every Director in the GalaxyBots roster.",
      ctaLabel: "Launch GalaxyBots",
      textColor: "text-amber-400",
      borderSelected: "border-amber-500/60",
      bgSelected: "bg-amber-500/10",
      shadowSelected: "shadow-[0_0_24px_rgba(245,158,11,0.25)]",
      glowBg: "bg-amber-500",
      badgeClasses: "bg-amber-500/10 border-amber-500/30 text-amber-400",
      progressBar: "bg-amber-500",
      features: [
        "Unlimited AI Executives",
        "Full Boardroom Command Centre",
        "Cross-Client Analytics & Reporting",
        "Custom Bot Personas on Request",
        "Dedicated Account Manager",
        "SLA + Compliance Reporting",
      ],
    },
  } as const;

  type PlanKey = keyof typeof PLAN_CONFIG;

  const DEPT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Strategy:          { bg: "bg-amber-500/20",   text: "text-amber-400",   border: "border-amber-500/30"   },
    Finance:           { bg: "bg-green-500/20",    text: "text-green-400",   border: "border-green-500/30"   },
    Technology:        { bg: "bg-cyan-500/20",     text: "text-cyan-400",    border: "border-cyan-500/30"    },
    Sales:             { bg: "bg-pink-500/20",     text: "text-pink-400",    border: "border-pink-500/30"    },
    Marketing:         { bg: "bg-rose-500/20",     text: "text-rose-400",    border: "border-rose-500/30"    },
    Operations:        { bg: "bg-blue-500/20",     text: "text-blue-400",    border: "border-blue-500/30"    },
    HR:                { bg: "bg-violet-500/20",   text: "text-violet-400",  border: "border-violet-500/30"  },
    "Human Resources": { bg: "bg-violet-500/20",   text: "text-violet-400",  border: "border-violet-500/30"  },
    Creative:          { bg: "bg-fuchsia-500/20",  text: "text-fuchsia-400", border: "border-fuchsia-500/30" },
    Legal:             { bg: "bg-orange-500/20",   text: "text-orange-400",  border: "border-orange-500/30"  },
    Executive:         { bg: "bg-amber-500/20",    text: "text-amber-400",   border: "border-amber-500/30"   },
    Board:             { bg: "bg-amber-500/20",    text: "text-amber-400",   border: "border-amber-500/30"   },
    Intelligence:      { bg: "bg-purple-500/20",   text: "text-purple-400",  border: "border-purple-500/30"  },
    Compliance:        { bg: "bg-red-500/20",      text: "text-red-400",     border: "border-red-500/30"     },
  };

  function getDeptColors(category?: string | null) {
    if (!category) return { bg: "bg-primary/20", text: "text-primary", border: "border-primary/30" };
    if (DEPT_COLORS[category]) return DEPT_COLORS[category];
    const found = Object.entries(DEPT_COLORS).find(([k]) =>
      category.toLowerCase().includes(k.toLowerCase()),
    );
    return found?.[1] ?? { bg: "bg-primary/20", text: "text-primary", border: "border-primary/30" };
  }

  interface BotCardProps {
    bot: Bot;
    selected: boolean;
    disabled: boolean;
    onToggle: () => void;
    cfg: (typeof PLAN_CONFIG)[PlanKey];
    isEnterprise: boolean;
  }

  function BotCard({ bot, selected, disabled, onToggle, cfg, isEnterprise }: BotCardProps) {
    const dept = getDeptColors(bot.category);
    const initials = (bot.name || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return (
      <button
        onClick={onToggle}
        disabled={disabled && !selected}
        aria-pressed={selected || isEnterprise}
        className={[
          "relative text-left rounded-xl border p-3.5 flex flex-col gap-2.5 transition-all duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          selected || isEnterprise
            ? `${cfg.borderSelected} ${cfg.bgSelected} ${cfg.shadowSelected}`
            : "border-border/40 bg-card hover:border-border/70 hover:bg-muted/30",
          disabled && !selected ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
          !disabled && !selected && !isEnterprise ? "hover:scale-[1.02]" : "",
        ].join(" ")}
      >
        {(selected || isEnterprise) && (
          <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow">
            <Check className="w-3 h-3 text-white" aria-hidden />
          </div>
        )}
        <div className={`w-11 h-11 rounded-lg ${dept.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={`text-lg font-bold ${dept.text} font-display leading-none`}>{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-tight truncate">{bot.name}</div>
          {bot.title && (
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
              {bot.title}
            </div>
          )}
        </div>
        {bot.category && (
          <Badge
            variant="outline"
            className={`text-[10px] self-start px-1.5 py-0 border ${dept.border} ${dept.text} bg-transparent`}
          >
            {bot.category}
          </Badge>
        )}
      </button>
    );
  }

  export default function WelcomePage() {
    const { user, token } = useAuth();
    const [, navigate] = useLocation();

    const rawPlan =
      user?.plan ??
      new URLSearchParams(window.location.search).get("plan") ??
      "team";
    const plan: PlanKey = (["single", "team", "enterprise"] as const).includes(
      rawPlan as PlanKey,
    )
      ? (rawPlan as PlanKey)
      : "team";
    const cfg = PLAN_CONFIG[plan];
    const isEnterprise = plan === "enterprise";
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

    const [bots, setBots] = useState<Bot[]>([]);
    const [botsLoading, setBotsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [launched, setLaunched] = useState(false);

    useEffect(() => {
      if (!token) { setBotsLoading(false); return; }
      fetch(`${BASE}/api/bots?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((data) => {
          const list: Bot[] = Array.isArray(data)
            ? data
            : (data.data ?? data.bots ?? []);
          setBots(list);
        })
        .catch(() => {})
        .finally(() => setBotsLoading(false));
    }, [token, BASE]);

    const botLimit = cfg.botLimit;
    const canLaunch = isEnterprise || selectedIds.size >= 1;
    const isComplete = !isEnterprise && selectedIds.size >= botLimit;

    const toggleBot = useCallback(
      (id: number) => {
        if (isEnterprise) return;
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else if (next.size < botLimit) {
            next.add(id);
          }
          return next;
        });
      },
      [botLimit, isEnterprise],
    );

    const handleLaunch = () => {
      localStorage.setItem("gb_selected_directors", JSON.stringify([...selectedIds]));
      localStorage.setItem("gb_welcome_completed", "1");
      setLaunched(true);
      setTimeout(() => navigate("/atrium"), 700);
    };

    const handleSkip = () => {
      localStorage.setItem("gb_welcome_completed", "1");
      navigate("/atrium");
    };

    if (launched) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <div
              className={`w-20 h-20 rounded-full ${cfg.bgSelected} border ${cfg.borderSelected} ${cfg.shadowSelected} flex items-center justify-center mx-auto`}
            >
              <Sparkles className={`w-10 h-10 ${cfg.textColor}`} />
            </div>
            <p className="text-xl font-display font-semibold">Launching your team…</p>
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background relative overflow-x-hidden">
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <div
            className={`absolute top-[-20%] left-1/2 -translate-x-1/2 w-[90vw] h-[65vh] rounded-full opacity-[0.07] blur-3xl ${cfg.glowBg}`}
          />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[40vh] rounded-full opacity-[0.04] blur-3xl bg-primary" />
        </div>

        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Hero */}
          <div className="text-center pt-14 pb-10 px-6">
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-tech mb-6 ${cfg.badgeClasses}`}
            >
              <Check className="w-3.5 h-3.5" aria-hidden />
              Payment Successful
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight mb-3">
              Welcome to{" "}
              <span className={cfg.textColor}>GalaxyBots</span>
            </h1>

            <p className="text-lg text-muted-foreground">
              Your{" "}
              <span className={`font-semibold ${cfg.textColor}`}>{cfg.name}</span>{" "}
              is now live.
            </p>

            <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-2xl mx-auto">
              {cfg.features.map((f) => (
                <span
                  key={f}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border ${cfg.badgeClasses}`}
                >
                  <Check className="w-3 h-3 flex-shrink-0" aria-hidden />
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Bot Selection */}
          <div className="flex-1 px-4 sm:px-6 pb-8">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-start justify-between mb-3 gap-4">
                <div>
                  <h2 className="text-2xl font-display font-bold">{cfg.selectionLabel}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{cfg.selectionNote}</p>
                </div>
                {!isEnterprise && (
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-3xl font-bold font-display leading-none ${
                        isComplete ? "text-green-400" : cfg.textColor
                      }`}
                    >
                      {selectedIds.size}
                      <span className="text-muted-foreground font-normal text-xl">
                        /{botLimit}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">selected</div>
                  </div>
                )}
              </div>

              {!isEnterprise && (
                <div className="w-full h-1.5 bg-muted rounded-full mb-6 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isComplete ? "bg-green-500" : cfg.progressBar
                    }`}
                    style={{
                      width: `${Math.min(100, (selectedIds.size / (botLimit as number)) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {botsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border/30 bg-muted/20 h-[148px] animate-pulse"
                    />
                  ))}
                </div>
              ) : bots.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" aria-hidden />
                  <p className="text-sm">
                    Your roster will appear here — you can appoint Directors from the Bot Roster after setup.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {bots.map((bot) => (
                    <BotCard
                      key={bot.id}
                      bot={bot}
                      selected={selectedIds.has(bot.id)}
                      disabled={
                        !isEnterprise &&
                        !selectedIds.has(bot.id) &&
                        selectedIds.size >= (botLimit as number)
                      }
                      onToggle={() => toggleBot(bot.id)}
                      cfg={cfg}
                      isEnterprise={isEnterprise}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 text-center px-6 pb-14">
            <div className="max-w-sm mx-auto space-y-3">
              {!isEnterprise && selectedIds.size === 0 && !botsLoading && bots.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Select at least 1 Director to continue.
                </p>
              )}
              <Button
                size="lg"
                variant="glow"
                onClick={handleLaunch}
                disabled={!canLaunch && !botsLoading}
                className="w-full gap-2 text-base py-6"
              >
                <Sparkles className="w-4 h-4" aria-hidden />
                {cfg.ctaLabel}
                <ChevronRight className="w-4 h-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="w-full text-muted-foreground text-xs"
              >
                I’ll explore the roster first →
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  