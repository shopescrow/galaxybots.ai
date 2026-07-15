import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback, memo, KeyboardEvent } from "react";
import { NAV_GROUPS, type NavGroup } from "./navConfig";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LIVE_BADGE_HREFS = new Set(["/live-rooms"]);
const LIVE_ROLES = new Set(["owner", "admin", "csuite"]);

function useActiveLiveHrefs(role: string | undefined, token: string | null): Set<string> {
  const [activeHrefs, setActiveHrefs] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!role || !token || !LIVE_ROLES.has(role)) {
      setActiveHrefs(new Set());
      return;
    }

    const check = async () => {
      try {
        const res = await fetch(`${BASE}/api/task-sessions/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setActiveHrefs(data.length > 0 ? LIVE_BADGE_HREFS : new Set());
        }
      } catch {
        /* non-fatal */
      }
    };

    check();
    timerRef.current = setInterval(check, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [role, token]);

  return activeHrefs;
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLinkClick?: () => void;
}

// ── District color palette ────────────────────────────────────────────────────
const DISTRICT: Record<string, { color: string; bg: string; glow: string; border: string }> = {
  gold:    { color: "hsl(45 100% 55%)",   bg: "hsl(45 100% 55% / 0.09)",   glow: "hsl(45 100% 55% / 0.22)",   border: "hsl(45 100% 55% / 0.25)"   },
  cyan:    { color: "hsl(190 90% 50%)",   bg: "hsl(190 90% 50% / 0.09)",   glow: "hsl(190 90% 50% / 0.22)",   border: "hsl(190 90% 50% / 0.25)"   },
  emerald: { color: "hsl(150 70% 50%)",   bg: "hsl(150 70% 50% / 0.09)",   glow: "hsl(150 70% 50% / 0.22)",   border: "hsl(150 70% 50% / 0.25)"   },
  purple:  { color: "hsl(270 80% 60%)",   bg: "hsl(270 80% 60% / 0.09)",   glow: "hsl(270 80% 60% / 0.22)",   border: "hsl(270 80% 60% / 0.25)"   },
  blue:    { color: "hsl(220 75% 60%)",   bg: "hsl(220 75% 60% / 0.09)",   glow: "hsl(220 75% 60% / 0.22)",   border: "hsl(220 75% 60% / 0.25)"   },
  amber:   { color: "hsl(38 100% 55%)",   bg: "hsl(38 100% 55% / 0.09)",   glow: "hsl(38 100% 55% / 0.22)",   border: "hsl(38 100% 55% / 0.25)"   },
};
const DEFAULT_DC = DISTRICT.purple;

function dc(group: NavGroup) {
  return (group.color && DISTRICT[group.color]) || DEFAULT_DC;
}

// ── Route helpers ─────────────────────────────────────────────────────────────
function isRouteActive(location: string, href: string): boolean {
  if (location === href) return true;
  if (location.startsWith(href + "/") || location.startsWith(href + "?")) return true;
  return false;
}

function findActiveChild(location: string, group: NavGroup): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const child of group.children) {
    if (isRouteActive(location, child.href) && child.href.length > bestLen) {
      best = child.href;
      bestLen = child.href.length;
    }
  }
  return best;
}

function isGroupActive(location: string, group: NavGroup): boolean {
  return findActiveChild(location, group) !== null;
}

function useOpenGroups(location: string): [string[], (id: string) => void] {
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const active = NAV_GROUPS.find((g) => isGroupActive(location, g));
    return active ? [active.id] : [];
  });

  useEffect(() => {
    const active = NAV_GROUPS.find((g) => isGroupActive(location, g));
    if (active && !openGroups.includes(active.id)) {
      setOpenGroups((prev) => [...prev, active.id]);
    }
  }, [location]);

  const toggle = useCallback((id: string) => {
    setOpenGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  return [openGroups, toggle];
}

// ── GroupFlyout ───────────────────────────────────────────────────────────────
interface FlyoutProps {
  group: NavGroup;
  onLinkClick?: () => void;
  location: string;
  liveHrefs: Set<string>;
}

function GroupFlyout({ group, onLinkClick, location, liveHrefs }: FlyoutProps) {
  const activeHref = findActiveChild(location, group);
  const d = dc(group);
  return (
    <div
      className="absolute left-full top-0 ml-2 w-56 z-50 rounded-2xl shadow-2xl py-2 backdrop-blur-xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, hsl(230 45% 5.5%) 0%, hsl(240 40% 4.5%) 100%)",
        border: `1px solid ${d.border}`,
        boxShadow: `0 24px 60px hsl(230 45% 2% / 0.8), 0 0 0 1px ${d.bg}, inset 0 1px 0 ${d.bg}`,
      }}
      role="menu"
    >
      <div
        className="flex items-center gap-2 px-3 py-2 mb-1"
        style={{ borderBottom: `1px solid ${d.bg}` }}
      >
        <span style={{ color: d.color, textShadow: `0 0 8px ${d.color}`, fontSize: "8px" }}>◆</span>
        <span style={{ color: d.color }} className="text-[10px] font-tech font-bold uppercase tracking-[0.2em] opacity-75">
          {group.district || group.label}
        </span>
      </div>
      {group.children.map((child) => {
        const active = activeHref === child.href;
        const hasLiveBadge = liveHrefs.has(child.href);
        return (
          <Link
            key={child.href}
            href={child.href}
            onClick={onLinkClick}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm font-tech transition-all duration-150"
            style={active ? { color: d.color, backgroundColor: d.bg } : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span className={cn("flex-1", active ? "" : "text-muted-foreground hover:text-foreground")}>{child.label}</span>
            {child.description && !hasLiveBadge && (
              <span className="text-[10px] text-muted-foreground/50 mt-0.5 hidden">{child.description}</span>
            )}
            {hasLiveBadge && (
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Sessions active" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ── IconRailItem (collapsed mode) ─────────────────────────────────────────────
interface IconRailItemProps {
  group: NavGroup;
  onLinkClick?: () => void;
  location: string;
  active: boolean;
  liveHrefs: Set<string>;
}

function IconRailItem({ group, onLinkClick, location, active, liveHrefs }: IconRailItemProps) {
  const [showFlyout, setShowFlyout] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const Icon = group.icon;
  const d = dc(group);

  const openFlyout = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setShowFlyout(true);
  };
  const closeFlyout = () => {
    hoverTimeout.current = setTimeout(() => setShowFlyout(false), 150);
  };

  const handleButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setShowFlyout((o) => !o);
    }
    if (e.key === "Escape") {
      setShowFlyout(false);
      buttonRef.current?.focus();
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowRight") && !showFlyout) {
      e.preventDefault();
      setShowFlyout(true);
    }
  };

  if (group.external && group.externalHref) {
    return (
      <a
        href={group.externalHref}
        title={group.label}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
        style={{ color: d.color }}
        aria-label={group.label}
      >
        <Icon className="w-5 h-5" />
      </a>
    );
  }

  return (
    <div className="relative" onMouseEnter={openFlyout} onMouseLeave={closeFlyout}>
      <button
        ref={buttonRef}
        onClick={() => setShowFlyout((o) => !o)}
        onKeyDown={handleButtonKeyDown}
        title={group.label}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
        style={active ? {
          color: d.color,
          backgroundColor: d.bg,
          boxShadow: `0 0 16px ${d.glow}, inset 0 0 12px ${d.bg}`,
        } : undefined}
        aria-label={group.label}
        aria-haspopup="menu"
        aria-expanded={showFlyout}
      >
        <Icon className={cn("w-5 h-5", !active && "text-muted-foreground")} />
        {active && (
          <span
            className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: d.color, boxShadow: `0 0 5px ${d.color}` }}
          />
        )}
      </button>
      {showFlyout && group.children.length > 0 && (
        <GroupFlyout
          group={group}
          onLinkClick={() => { setShowFlyout(false); onLinkClick?.(); }}
          location={location}
          liveHrefs={liveHrefs}
        />
      )}
    </div>
  );
}

// ── AccordionGroup (expanded mode) ────────────────────────────────────────────
interface AccordionGroupProps {
  group: NavGroup;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onLinkClick?: () => void;
  location: string;
  activeChildHref: string | null;
  showDistrictLabel: boolean;
  liveHrefs: Set<string>;
}

const AccordionGroup = memo(function AccordionGroup({
  group,
  isOpen,
  isActive,
  onToggle,
  onLinkClick,
  location,
  activeChildHref,
  showDistrictLabel,
  liveHrefs,
}: AccordionGroupProps) {
  const Icon = group.icon;
  const groupRef = useRef<HTMLDivElement>(null);
  const d = dc(group);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      if (isOpen) onToggle();
      return;
    }
    if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      const firstLink = groupRef.current?.querySelector<HTMLAnchorElement>("a[href]");
      firstLink?.focus();
    }
  };

  const handleChildKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const links = Array.from(
      groupRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      links[index + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index === 0) {
        groupRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      } else {
        links[index - 1]?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (isOpen) onToggle();
      groupRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  };

  if (group.external && group.externalHref) {
    return (
      <div>
        {showDistrictLabel && group.district && (
          <div className="px-3 pt-3 pb-0.5">
            <span className="text-[9px] font-tech font-bold uppercase tracking-[0.22em] opacity-35" style={{ color: d.color }}>
              {group.district}
            </span>
          </div>
        )}
        <a
          href={group.externalHref}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-tech text-sm font-semibold transition-all duration-200"
          style={{ color: d.color }}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span>{group.label}</span>
        </a>
      </div>
    );
  }

  return (
    <div ref={groupRef}>
      {showDistrictLabel && group.district && (
        <div className="px-3 pt-3 pb-0.5">
          <span className="text-[9px] font-tech font-bold uppercase tracking-[0.22em] opacity-35" style={{ color: d.color }}>
            {group.district}
          </span>
        </div>
      )}
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-tech text-sm font-semibold transition-all duration-200"
        style={isActive ? {
          color: d.color,
          backgroundColor: d.bg,
          boxShadow: `inset 2px 0 0 ${d.color}`,
        } : undefined}
      >
        <Icon className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "" : "text-muted-foreground")} />
        <span className={cn("flex-1 text-left transition-colors", isActive ? "" : "text-muted-foreground")}>{group.label}</span>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-35" />
        )}
      </button>

      {isOpen && (
        <div
          className="ml-7 mt-0.5 flex flex-col gap-0.5 pl-3"
          style={{ borderLeft: `1px solid ${d.border}` }}
        >
          {group.children.map((child, idx) => {
            const active = activeChildHref === child.href;
            const hasLiveBadge = liveHrefs.has(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onLinkClick}
                onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => handleChildKeyDown(e, idx)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg font-tech text-sm transition-all duration-150"
                style={active ? { color: d.color, backgroundColor: d.bg } : undefined}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className="text-[7px] shrink-0 leading-none transition-all"
                  style={active
                    ? { color: d.color, textShadow: `0 0 5px ${d.color}` }
                    : { color: "transparent" }
                  }
                >
                  ●
                </span>
                <span className={cn("text-sm leading-none flex-1", active ? "" : "text-muted-foreground")}>
                  {child.label}
                </span>
                {hasLiveBadge && (
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Sessions active" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.isOpen === next.isOpen &&
  prev.isActive === next.isActive &&
  prev.activeChildHref === next.activeChildHref &&
  prev.showDistrictLabel === next.showDistrictLabel &&
  prev.liveHrefs === next.liveHrefs
);

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar({ collapsed, mobileOpen, onCloseMobile, onLinkClick }: SidebarProps) {
  const [location] = useLocation();
  const { user, token } = useAuth();
  const [openGroups, toggleGroup] = useOpenGroups(location);
  const liveHrefs = useActiveLiveHrefs(user?.role, token);

  const visibleGroups = NAV_GROUPS.filter((g) => {
    if (!g.roles) return true;
    return user && g.roles.includes(user.role);
  });

  const handleLinkClick = useCallback(() => {
    onCloseMobile();
    onLinkClick?.();
  }, [onCloseMobile, onLinkClick]);

  const sidebarStyle = {
    background: "linear-gradient(180deg, hsl(230 50% 3.5%) 0%, hsl(245 42% 5%) 50%, hsl(230 50% 3.5%) 100%)",
    borderRight: "1px solid hsl(270 80% 60% / 0.10)",
    boxShadow: "4px 0 40px hsl(270 80% 60% / 0.03), inset -1px 0 0 hsl(270 80% 60% / 0.05)",
  };

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden py-3 scrollbar-hide">
      {collapsed ? (
        <div className="flex flex-col items-center gap-1.5 px-2">
          {visibleGroups.map((group) => (
            <IconRailItem
              key={group.id}
              group={group}
              onLinkClick={handleLinkClick}
              location={location}
              active={isGroupActive(location, group)}
              liveHrefs={liveHrefs}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 px-2">
          {visibleGroups.map((group, idx) => (
            <AccordionGroup
              key={group.id}
              group={group}
              isOpen={openGroups.includes(group.id)}
              isActive={isGroupActive(location, group)}
              activeChildHref={findActiveChild(location, group)}
              onToggle={() => toggleGroup(group.id)}
              onLinkClick={handleLinkClick}
              location={location}
              showDistrictLabel={idx > 0}
              liveHrefs={liveHrefs}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Desktop sidebar */}
      <aside
        id="galaxy-sidebar"
        className={cn(
          "fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-40 flex flex-col transition-all duration-300",
          "hidden lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
        style={sidebarStyle}
        aria-label="Sidebar navigation"
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      <aside
        id="mobile-nav"
        className={cn(
          "fixed top-0 left-0 h-full w-72 z-50 flex flex-col shadow-2xl transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "linear-gradient(180deg, hsl(230 50% 3.5%) 0%, hsl(245 42% 5%) 50%, hsl(230 50% 3.5%) 100%)",
          borderRight: "1px solid hsl(270 80% 60% / 0.12)",
        }}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        <div
          className="flex items-center justify-between px-4 h-14"
          style={{ borderBottom: "1px solid hsl(270 80% 60% / 0.12)" }}
        >
          <span className="font-display font-bold text-lg tracking-wider">
            GALAXY<span style={{ color: "hsl(270 80% 60%)", textShadow: "0 0 16px hsl(270 80% 60% / 0.5)" }}>BOTS</span>
          </span>
          <button
            onClick={onCloseMobile}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="flex flex-col gap-0.5 px-2 py-3">
            {visibleGroups.map((group, idx) => (
              <AccordionGroup
                key={group.id}
                group={group}
                isOpen={openGroups.includes(group.id)}
                isActive={isGroupActive(location, group)}
                activeChildHref={findActiveChild(location, group)}
                onToggle={() => toggleGroup(group.id)}
                onLinkClick={handleLinkClick}
                location={location}
                showDistrictLabel={idx > 0}
                liveHrefs={liveHrefs}
              />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
