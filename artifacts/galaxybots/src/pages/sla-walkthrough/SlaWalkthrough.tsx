import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Shield, Zap, Clock, AlertTriangle, BarChart3, Settings,
  ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX,
  ArrowLeft, CheckCircle2, Target, TrendingUp, Bell
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  narration: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  accentColor: string;
  bgGradient: string;
}

const tierData = [
  { name: "Standard", response: "90s", resolution: "4h", color: "#3b82f6", plans: "Free / Starter / Standard" },
  { name: "Priority", response: "30s", resolution: "90m", color: "#f59e0b", plans: "Team / Priority" },
  { name: "Enterprise", response: "10s", resolution: "30m", color: "#8b5cf6", plans: "Enterprise" },
];

function TierCards() {
  const [reveal, setReveal] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setReveal(1), 400),
      setTimeout(() => setReveal(2), 800),
      setTimeout(() => setReveal(3), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex gap-6 mt-6 justify-center flex-wrap">
      {tierData.map((tier, i) => (
        <motion.div
          key={tier.name}
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={reveal > i ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-white/10 p-6 w-56 backdrop-blur-sm"
          style={{ background: `linear-gradient(135deg, ${tier.color}15, ${tier.color}08)`, borderColor: `${tier.color}30` }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: tier.color }}>{tier.plans}</div>
          <div className="text-xl font-bold text-white mb-4">{tier.name}</div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-white/70">Response: <span className="text-white font-semibold">{tier.response}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white/70">Resolution: <span className="text-white font-semibold">{tier.resolution}</span></span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function ComplianceRing() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPct(97.3), 600);
    return () => clearTimeout(t);
  }, []);
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="flex items-center gap-10 mt-6 justify-center">
      <div className="relative">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
          <motion.circle
            cx="90" cy="90" r={r} fill="none" stroke="#10b981" strokeWidth="12"
            strokeLinecap="round" strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            transform="rotate(-90 90 90)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-3xl font-bold text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >{pct}%</motion.span>
          <span className="text-xs text-white/50 mt-1">Compliance</span>
        </div>
      </div>
      <div className="space-y-4">
        {[
          { label: "Avg Response", value: "2.4s", icon: <Zap className="w-4 h-4 text-yellow-400" /> },
          { label: "Breaches (24h)", value: "3", icon: <AlertTriangle className="w-4 h-4 text-red-400" /> },
          { label: "Events Tracked", value: "1,247", icon: <BarChart3 className="w-4 h-4 text-cyan-400" /> },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1 + i * 0.2, duration: 0.5 }}
            className="flex items-center gap-3"
          >
            {stat.icon}
            <div>
              <div className="text-xs text-white/50">{stat.label}</div>
              <div className="text-lg font-semibold text-white">{stat.value}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BreachTimeline() {
  const events = [
    { time: "09:14 AM", bot: "Sales Director", status: "breach", detail: "Response: 95s (target: 30s)" },
    { time: "10:32 AM", bot: "CFO", status: "met", detail: "Response: 8s (target: 90s)" },
    { time: "11:05 AM", bot: "CMO", status: "met", detail: "Response: 22s (target: 30s)" },
    { time: "02:18 PM", bot: "Head of Growth", status: "breach", detail: "Response: 142s (target: 90s)" },
    { time: "03:45 PM", bot: "CTO", status: "met", detail: "Response: 5s (target: 10s)" },
  ];

  return (
    <div className="mt-6 space-y-3 max-w-lg mx-auto">
      {events.map((evt, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.2, duration: 0.4 }}
          className={`flex items-center gap-4 rounded-xl px-4 py-3 border ${
            evt.status === "breach"
              ? "border-red-500/30 bg-red-500/5"
              : "border-emerald-500/20 bg-emerald-500/5"
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${evt.status === "breach" ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
          <span className="text-xs text-white/40 w-16 shrink-0">{evt.time}</span>
          <span className="text-sm font-medium text-white flex-1">{evt.bot}</span>
          <span className="text-xs text-white/50">{evt.detail}</span>
          {evt.status === "breach" && <AlertTriangle className="w-4 h-4 text-red-400" />}
          {evt.status === "met" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        </motion.div>
      ))}
    </div>
  );
}

function OverrideConfig() {
  const [selected, setSelected] = useState(1);

  return (
    <div className="mt-6 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
      >
        <div className="text-sm text-white/50 mb-3">Select SLA Tier for "Sales Director"</div>
        <div className="space-y-2 mb-6">
          {tierData.map((tier, i) => (
            <motion.button
              key={tier.name}
              onClick={() => setSelected(i)}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${
                selected === i
                  ? "border-white/30 bg-white/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: tier.color }} />
                <span className="text-sm font-medium text-white">{tier.name}</span>
              </div>
              <span className="text-xs text-white/40">{tier.response} / {tier.resolution}</span>
            </motion.button>
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="border-t border-white/10 pt-4"
        >
          <div className="text-xs text-white/40 mb-2">Custom Override (must be tighter than tier default)</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] text-white/30">Max Response</div>
              <div className="text-sm text-white font-mono">25s</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] text-white/30">Max Resolution</div>
              <div className="text-sm text-white font-mono">60m</div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function CommandCenterPreview() {
  const stats = [
    { label: "Overall SLA", value: "96.8%", trend: "+1.2%", color: "#10b981" },
    { label: "Active Breaches", value: "2", trend: "-3", color: "#ef4444" },
    { label: "Avg Response", value: "4.2s", trend: "-0.8s", color: "#3b82f6" },
  ];

  return (
    <div className="mt-6 space-y-4 max-w-xl mx-auto">
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.15, duration: 0.5 }}
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-center"
          >
            <div className="text-[10px] text-white/40 uppercase tracking-wider">{stat.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs text-emerald-400 mt-1">{stat.trend}</div>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="rounded-xl border border-white/10 bg-white/5 p-4"
      >
        <div className="text-xs text-white/40 mb-3">Bot Performance Ranking</div>
        {[
          { name: "CTO", pct: 99.1, bar: "#8b5cf6" },
          { name: "CFO", pct: 98.4, bar: "#3b82f6" },
          { name: "CMO", pct: 95.2, bar: "#f59e0b" },
          { name: "Sales Director", pct: 91.8, bar: "#ef4444" },
        ].map((bot, i) => (
          <motion.div
            key={bot.name}
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "100%" }}
            transition={{ delay: 1.2 + i * 0.15, duration: 0.4 }}
            className="flex items-center gap-3 mb-2"
          >
            <span className="text-xs text-white/60 w-24">{bot.name}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: bot.bar }}
                initial={{ width: "0%" }}
                animate={{ width: `${bot.pct}%` }}
                transition={{ delay: 1.4 + i * 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="text-xs text-white/40 w-12 text-right">{bot.pct}%</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function ROIPreview() {
  return (
    <div className="mt-6 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium text-white">SLA Performance Card</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: "Compliance Rate", value: "97.3%" },
            { label: "Response SLA Met", value: "1,209 / 1,247" },
            { label: "Avg Response Time", value: "2.4s" },
            { label: "SLA Value Score", value: "$12,450" },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + i * 0.15, duration: 0.4 }}
            >
              <div className="text-[10px] text-white/40">{item.label}</div>
              <div className="text-lg font-semibold text-white">{item.value}</div>
            </motion.div>
          ))}
        </div>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="h-1 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 origin-left"
        />
      </motion.div>
    </div>
  );
}

const slides: Slide[] = [
  {
    id: "intro",
    title: "Bot SLA & Performance Guarantees",
    subtitle: "Enterprise-grade reliability for every AI interaction",
    narration: "Introducing Bot SLA and Performance Guarantees. This feature brings enterprise-grade reliability tracking to every AI bot interaction on the GalaxyBots platform. Let's walk through how it works.",
    icon: <Shield className="w-8 h-8" />,
    content: (
      <div className="flex flex-col items-center mt-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.5 }}
          className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mb-6"
        >
          <Shield className="w-12 h-12 text-white" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex gap-8 text-center"
        >
          {["Response Time Tracking", "Breach Detection", "Compliance Scoring"].map((feat, i) => (
            <motion.div
              key={feat}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + i * 0.2 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                {[<Zap className="w-5 h-5 text-yellow-400" />, <Bell className="w-5 h-5 text-red-400" />, <Target className="w-5 h-5 text-emerald-400" />][i]}
              </div>
              <span className="text-xs text-white/60">{feat}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    ),
    accentColor: "#8b5cf6",
    bgGradient: "from-slate-950 via-violet-950/30 to-slate-950",
  },
  {
    id: "tiers",
    title: "Three SLA Tiers",
    subtitle: "Automatically mapped from your subscription plan",
    narration: "The system includes three configurable SLA tiers. Standard provides a 90-second response target and 4-hour resolution window. Priority tightens that to 30 seconds and 90 minutes. Enterprise offers the strictest guarantees at 10 seconds and 30 minutes. Your tier is automatically assigned based on your subscription plan.",
    icon: <Target className="w-8 h-8" />,
    content: <TierCards />,
    accentColor: "#f59e0b",
    bgGradient: "from-slate-950 via-amber-950/20 to-slate-950",
  },
  {
    id: "tracking",
    title: "Real-Time Compliance Tracking",
    subtitle: "Every message is measured against SLA targets",
    narration: "Every bot interaction is tracked in real time. When a user sends a message, an SLA directive is recorded. When the bot responds, the response time is measured against the tier target. This data feeds into a per-bot compliance scorecard showing compliance percentage, average response time, and breach counts.",
    icon: <BarChart3 className="w-8 h-8" />,
    content: <ComplianceRing />,
    accentColor: "#10b981",
    bgGradient: "from-slate-950 via-emerald-950/20 to-slate-950",
  },
  {
    id: "breaches",
    title: "Breach Detection & Alerts",
    subtitle: "60-second breach checks with real-time SSE notifications",
    narration: "The breach detection engine runs every 60 seconds. It checks all pending SLA events and identifies any that have exceeded their response time target. When a breach is detected, the system fires a real-time Server-Sent Event alert so operators can respond immediately. Here's a sample timeline showing breaches flagged alongside successful responses.",
    icon: <AlertTriangle className="w-8 h-8" />,
    content: <BreachTimeline />,
    accentColor: "#ef4444",
    bgGradient: "from-slate-950 via-red-950/20 to-slate-950",
  },
  {
    id: "config",
    title: "Per-Bot SLA Configuration",
    subtitle: "Override tiers with custom, tighter targets",
    narration: "Each bot can be individually configured with a tier override. You can assign any bot a specific SLA tier, or set custom response and resolution targets. The system enforces that custom overrides can only be tighter than the tier default, never looser, ensuring service quality only goes up.",
    icon: <Settings className="w-8 h-8" />,
    content: <OverrideConfig />,
    accentColor: "#3b82f6",
    bgGradient: "from-slate-950 via-blue-950/20 to-slate-950",
  },
  {
    id: "command",
    title: "Command Center SLA Health",
    subtitle: "At-a-glance SLA metrics across your entire fleet",
    narration: "The Command Center now includes a dedicated SLA Health section. It shows overall compliance rate, active breach count, and average response time across all bots. A performance ranking lets you quickly identify which bots are meeting their guarantees and which need attention.",
    icon: <BarChart3 className="w-8 h-8" />,
    content: <CommandCenterPreview />,
    accentColor: "#06b6d4",
    bgGradient: "from-slate-950 via-cyan-950/20 to-slate-950",
  },
  {
    id: "roi",
    title: "ROI Dashboard Integration",
    subtitle: "SLA performance feeds directly into business value metrics",
    narration: "Finally, SLA performance data is integrated into the ROI Dashboard with a dedicated SLA Performance card. This connects reliability metrics directly to business value, showing stakeholders the concrete impact of performance guarantees on service quality and customer satisfaction.",
    icon: <TrendingUp className="w-8 h-8" />,
    content: <ROIPreview />,
    accentColor: "#10b981",
    bgGradient: "from-slate-950 via-emerald-950/20 to-slate-950",
  },
];

export default function SlaWalkthrough() {
  const [, setLocation] = useLocation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioCache, setAudioCache] = useState<Record<number, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const generateAudio = useCallback(async (slideIndex: number): Promise<string | null> => {
    if (audioCache[slideIndex]) return audioCache[slideIndex];

    setAudioLoading(true);
    try {
      const res = await fetch(`${BASE}/api/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: slides[slideIndex].narration }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const audioUrl = `data:${data.contentType};base64,${data.audio}`;
      setAudioCache(prev => ({ ...prev, [slideIndex]: audioUrl }));
      return audioUrl;
    } catch {
      return null;
    } finally {
      setAudioLoading(false);
    }
  }, [audioCache]);

  const playSlide = useCallback(async (index: number) => {
    stopAudio();

    if (isMuted) {
      timerRef.current = setTimeout(() => {
        if (index < slides.length - 1) {
          setCurrentSlide(index + 1);
        } else {
          setIsPlaying(false);
        }
      }, 8000);
      return;
    }

    const audioUrl = await generateAudio(index);
    if (!audioUrl) {
      timerRef.current = setTimeout(() => {
        if (index < slides.length - 1) {
          setCurrentSlide(index + 1);
        } else {
          setIsPlaying(false);
        }
      }, 8000);
      return;
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.volume = 1;

    audio.onended = () => {
      timerRef.current = setTimeout(() => {
        if (index < slides.length - 1) {
          setCurrentSlide(index + 1);
        } else {
          setIsPlaying(false);
        }
      }, 1500);
    };

    audio.play().catch(() => {});
  }, [isMuted, generateAudio, stopAudio]);

  useEffect(() => {
    if (isPlaying) {
      playSlide(currentSlide);
    }
    return () => stopAudio();
  }, [currentSlide, isPlaying, playSlide, stopAudio]);

  useEffect(() => {
    if (isPlaying && currentSlide < slides.length - 1) {
      generateAudio(currentSlide + 1);
    }
  }, [currentSlide, isPlaying, generateAudio]);

  const goNext = () => {
    stopAudio();
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const goPrev = () => {
    stopAudio();
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  const slide = slides[currentSlide];

  return (
    <div className={`min-h-screen bg-gradient-to-br ${slide.bgGradient} text-white relative overflow-hidden`}>
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: `radial-gradient(600px circle at ${30 + currentSlide * 10}% ${40 + (currentSlide % 3) * 10}%, ${slide.accentColor}08, transparent 70%)`,
        }}
        transition={{ duration: 1.2 }}
      />

      <motion.div
        className="absolute top-20 -right-20 w-96 h-96 rounded-full opacity-[0.03]"
        style={{ background: slide.accentColor }}
        animate={{
          scale: [1, 1.2, 1],
          x: currentSlide * -30,
          y: currentSlide * 15,
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.02]"
        style={{ background: slide.accentColor }}
        animate={{
          scale: [1.1, 1, 1.1],
          rotate: [0, 45, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 flex flex-col h-screen">
        <div className="flex items-center justify-between px-6 py-4">
          <button
            onClick={() => setLocation("/command-center")}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Shield className="w-4 h-4" />
            SLA Feature Walkthrough
          </div>
          <div className="text-sm text-white/30">
            {currentSlide + 1} / {slides.length}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-center max-w-3xl w-full"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
                className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                style={{ background: `${slide.accentColor}20`, color: slide.accentColor }}
              >
                {slide.icon}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-3xl md:text-4xl font-bold mb-3 tracking-tight"
              >
                {slide.title}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="text-base text-white/50 mb-2"
              >
                {slide.subtitle}
              </motion.p>

              {slide.content}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className="flex gap-1 px-6 mb-4">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => { stopAudio(); setCurrentSlide(i); }}
                className="flex-1 h-1 rounded-full transition-all"
              >
                <motion.div
                  className="h-full rounded-full"
                  animate={{
                    background: i === currentSlide ? slide.accentColor : i < currentSlide ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)",
                    scaleX: i === currentSlide ? 1 : 0.9,
                  }}
                  transition={{ duration: 0.3 }}
                  style={{ width: "100%", height: "100%" }}
                />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-6 pb-6 pt-2 bg-gradient-to-t from-black/40 to-transparent">
            <button
              onClick={goPrev}
              disabled={currentSlide === 0}
              className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center disabled:opacity-20 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-white/50" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all"
                style={{ background: slide.accentColor }}
              >
                {audioLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>

              <button
                onClick={toggleMute}
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center opacity-0 pointer-events-none"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={goNext}
              disabled={currentSlide === slides.length - 1}
              className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center disabled:opacity-20 hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
