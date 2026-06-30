import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Zap, LayoutGrid } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { NAV_GROUPS } from "@/components/layout/navConfig";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const DISTRICT_COLORS: Record<string, {
  color: string; bg: string; glow: string; border: string; gradientStop: string;
}> = {
  gold:    { color: "hsl(45 100% 55%)",   bg: "hsl(45 100% 55% / 0.07)",   glow: "0 0 48px hsl(45 100% 55% / 0.22)",   border: "hsl(45 100% 55% / 0.2)",   gradientStop: "hsl(45 100% 55% / 0.08)"   },
  cyan:    { color: "hsl(190 90% 50%)",   bg: "hsl(190 90% 50% / 0.07)",   glow: "0 0 48px hsl(190 90% 50% / 0.22)",   border: "hsl(190 90% 50% / 0.2)",   gradientStop: "hsl(190 90% 50% / 0.08)"   },
  emerald: { color: "hsl(150 70% 50%)",   bg: "hsl(150 70% 50% / 0.07)",   glow: "0 0 48px hsl(150 70% 50% / 0.22)",   border: "hsl(150 70% 50% / 0.2)",   gradientStop: "hsl(150 70% 50% / 0.08)"   },
  purple:  { color: "hsl(270 80% 60%)",   bg: "hsl(270 80% 60% / 0.07)",   glow: "0 0 48px hsl(270 80% 60% / 0.22)",   border: "hsl(270 80% 60% / 0.2)",   gradientStop: "hsl(270 80% 60% / 0.08)"   },
  blue:    { color: "hsl(220 75% 60%)",   bg: "hsl(220 75% 60% / 0.07)",   glow: "0 0 48px hsl(220 75% 60% / 0.22)",   border: "hsl(220 75% 60% / 0.2)",   gradientStop: "hsl(220 75% 60% / 0.08)"   },
  amber:   { color: "hsl(38 100% 55%)",   bg: "hsl(38 100% 55% / 0.07)",   glow: "0 0 48px hsl(38 100% 55% / 0.22)",   border: "hsl(38 100% 55% / 0.2)",   gradientStop: "hsl(38 100% 55% / 0.08)"   },
};
const DEFAULT_DC = DISTRICT_COLORS.purple;

function dco(color?: string) {
  return (color && DISTRICT_COLORS[color]) || DEFAULT_DC;
}

type NavGroup = (typeof NAV_GROUPS)[number];

interface DistrictCardProps {
  group: NavGroup;
  idx: number;
  prefersReducedMotion: boolean | null;
}

function DistrictCard({ group, idx, prefersReducedMotion }: DistrictCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [, navigate] = useLocation();
  const d = dco(group.color);
  const Icon = group.icon;
  const quickLinks = group.children.slice(0, 5);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.055, ease: [0.16, 1, 0.3, 1] }}
      role="group"
      aria-label={`${group.label} District`}
      className="relative rounded-2xl p-5 flex flex-col gap-4 overflow-hidden"
      style={{
        background: `linear-gradient(145deg, hsl(230 48% 5%) 0%, ${d.gradientStop} 100%)`,
        border: `1px solid ${isHovered ? d.border : d.border.replace("0.2", "0.12")}`,
        boxShadow: isHovered
          ? `${d.glow}, 0 12px 40px hsl(230 50% 2% / 0.5)`
          : "0 4px 20px hsl(230 50% 2% / 0.35)",
        transform: isHovered ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        cursor: "default",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Decorative corner glow */}
      <div
        className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${d.color}, transparent 70%)`,
          opacity: isHovered ? 0.18 : 0.1,
          transition: "opacity 0.25s ease",
        }}
      />

      {/* District header */}
      <div
        className="flex items-center gap-3 relative z-10"
        role="button"
        tabIndex={0}
        aria-label={`Go to ${group.label} District`}
        onClick={() => navigate(group.children[0].href)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(group.children[0].href);
          }
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
          style={{
            background: d.bg,
            border: `1px solid ${d.border}`,
            boxShadow: isHovered ? `0 0 20px ${d.color}40` : "none",
          }}
        >
          <Icon style={{ color: d.color, width: "18px", height: "18px" }} />
        </div>
        <div className="min-w-0">
          <div
            className="text-[9px] font-tech font-bold uppercase tracking-[0.22em] opacity-50"
            style={{ color: d.color }}
          >
            {group.district || "District"}
          </div>
          <div
            className="text-sm font-display font-bold tracking-wide"
            style={{ color: d.color }}
          >
            {group.label}
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px" style={{ background: `${d.border}` }} />

      {/* Quick links */}
      <div className="flex flex-col gap-0.5 relative z-10" role="list" aria-label={`${group.label} pages`}>
        {quickLinks.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            role="listitem"
            className="group/link flex items-center justify-between px-2.5 py-1.5 rounded-lg font-tech text-sm text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-white/[0.04]"
          >
            <span className="truncate">{child.label}</span>
            <ArrowUpRight
              className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover/link:opacity-50 transition-opacity duration-150 ml-1"
              aria-hidden="true"
              style={{ color: d.color }}
            />
          </Link>
        ))}
        {group.children.length > 5 && (
          <Link
            href={group.children[0].href}
            className="flex items-center gap-1 px-2.5 py-1 font-tech text-xs transition-colors"
            style={{ color: d.color, opacity: 0.5 }}
          >
            +{group.children.length - 5} more
          </Link>
        )}
      </div>
    </motion.div>
  );
}

export default function GalaxyAtrium() {
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const displayName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "Commander";

  const visibleGroups = NAV_GROUPS.filter((g) => {
    if (g.external) return false;
    if (!g.roles) return true;
    return user && g.roles.includes(user.role);
  });

  return (
    <AppLayout>
      <div className="min-h-full p-5 lg:p-8 space-y-6">

        {/* ── Hero atrium strip ──────────────────────────────────────── */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-2xl px-8 py-7"
          style={{
            background: "linear-gradient(135deg, hsl(230 52% 5%) 0%, hsl(256 45% 7.5%) 50%, hsl(230 52% 4.5%) 100%)",
            border: "1px solid hsl(270 80% 60% / 0.16)",
            boxShadow: "0 0 80px hsl(270 80% 60% / 0.05), inset 0 1px 0 hsl(270 80% 60% / 0.09)",
          }}
        >
          {/* Ambient nebula */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse at 15% 60%, hsl(270 80% 60% / 0.07) 0%, transparent 55%),
                radial-gradient(ellipse at 85% 25%, hsl(190 90% 50% / 0.05) 0%, transparent 45%),
                radial-gradient(ellipse at 50% 100%, hsl(45 100% 55% / 0.03) 0%, transparent 50%)
              `,
            }}
          />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(hsl(270 80% 60% / 0.025) 1px, transparent 1px), linear-gradient(90deg, hsl(270 80% 60% / 0.025) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5" style={{ color: "hsl(45 100% 55%)" }} />
                <span className="text-[10px] font-tech font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  Galaxy Mall · Mission Control
                </span>
              </div>
              <h1
                className="text-3xl lg:text-4xl font-display font-bold tracking-wider leading-tight"
                style={{ textShadow: "0 0 40px hsl(270 80% 60% / 0.28)" }}
              >
                WELCOME BACK,{" "}
                <span style={{ color: "hsl(270 80% 68%)" }}>
                  {displayName.toUpperCase()}
                </span>
              </h1>
              <p className="text-muted-foreground font-tech text-sm mt-2 opacity-70">
                {visibleGroups.length} districts active · all systems nominal
              </p>
            </div>
            <Link
              href="/command-center"
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-tech text-sm font-semibold transition-all duration-200 hover:scale-105 hover:brightness-110"
              style={{
                background: "hsl(270 80% 60% / 0.15)",
                border: "1px solid hsl(270 80% 60% / 0.3)",
                color: "hsl(270 80% 75%)",
                boxShadow: "0 0 20px hsl(270 80% 60% / 0.12)",
              }}
            >
              Command Center
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {/* ── District label ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-tech font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-50">
            Districts
          </span>
          <div className="flex-1 h-px" style={{ background: "hsl(270 80% 60% / 0.08)" }} />
        </div>

        {/* ── District cards grid or empty state ─────────────────────── */}
        {visibleGroups.length === 0 ? (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-border/40"
            style={{ background: "hsl(230 52% 4%)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: "hsl(270 80% 60% / 0.08)", border: "1px solid hsl(270 80% 60% / 0.2)" }}
            >
              <LayoutGrid className="w-8 h-8" style={{ color: "hsl(270 80% 60%)" }} />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">No Districts Configured</h2>
            <p className="text-sm text-muted-foreground font-tech text-center max-w-xs mb-6">
              Your account doesn't have any districts visible yet. Configure your navigation groups in Settings to unlock your workspace.
            </p>
            <Link href="/settings">
              <Button variant="outline" className="font-tech gap-2">
                Go to Settings
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleGroups.map((group, idx) => (
              <DistrictCard
                key={group.id}
                group={group}
                idx={idx}
                prefersReducedMotion={prefersReducedMotion}
              />
            ))}
          </div>
        )}

        {/* ── Bottom spacer ──────────────────────────────────────────── */}
        <div className="h-4" />
      </div>
    </AppLayout>
  );
}
