import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import { NAV_GROUPS, type NavGroup } from "./navConfig";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLinkClick?: () => void;
}

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

interface FlyoutProps {
  group: NavGroup;
  onLinkClick?: () => void;
  location: string;
}

function GroupFlyout({ group, onLinkClick, location }: FlyoutProps) {
  const activeHref = findActiveChild(location, group);
  return (
    <div
      className="absolute left-full top-0 ml-2 w-52 z-50 rounded-xl border border-border/60 bg-background/95 shadow-2xl py-2 backdrop-blur-xl"
      role="menu"
    >
      <div className="px-3 py-1.5 text-[10px] font-tech font-semibold uppercase tracking-widest text-muted-foreground">
        {group.label}
      </div>
      {group.children.map((child) => {
        const active = activeHref === child.href;
        return (
          <Link
            key={child.href}
            href={child.href}
            onClick={onLinkClick}
            role="menuitem"
            className={cn(
              "flex flex-col px-3 py-2 text-sm font-tech transition-colors",
              active
                ? "text-primary bg-secondary/60"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            )}
            aria-current={active ? "page" : undefined}
          >
            <span>{child.label}</span>
            {child.description && (
              <span className="text-[11px] text-muted-foreground/70">{child.description}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

interface IconRailItemProps {
  group: NavGroup;
  onLinkClick?: () => void;
  location: string;
  active: boolean;
}

function IconRailItem({ group, onLinkClick, location, active }: IconRailItemProps) {
  const [showFlyout, setShowFlyout] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const Icon = group.icon;

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
        className={cn(
          "relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
          "text-amber-400 hover:bg-amber-400/10"
        )}
        aria-label={group.label}
      >
        <Icon className="w-5 h-5" />
      </a>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={openFlyout}
      onMouseLeave={closeFlyout}
    >
      <button
        ref={buttonRef}
        onClick={() => setShowFlyout((o) => !o)}
        onKeyDown={handleButtonKeyDown}
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        )}
        aria-label={group.label}
        aria-haspopup="menu"
        aria-expanded={showFlyout}
      >
        <Icon className="w-5 h-5" />
      </button>
      {showFlyout && group.children.length > 0 && (
        <GroupFlyout
          group={group}
          onLinkClick={() => { setShowFlyout(false); onLinkClick?.(); }}
          location={location}
        />
      )}
    </div>
  );
}

interface AccordionGroupProps {
  group: NavGroup;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onLinkClick?: () => void;
  location: string;
  activeChildHref: string | null;
}

function AccordionGroup({
  group,
  isOpen,
  isActive,
  onToggle,
  onLinkClick,
  location,
  activeChildHref,
}: AccordionGroupProps) {
  const Icon = group.icon;
  const groupRef = useRef<HTMLDivElement>(null);

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
      <a
        href={group.externalHref}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl font-tech text-sm font-semibold transition-colors",
          "text-amber-400 hover:bg-amber-400/10"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span>{group.label}</span>
      </a>
    );
  }

  return (
    <div ref={groupRef}>
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-tech text-sm font-semibold transition-colors",
          isActive
            ? "text-primary bg-primary/8"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="ml-7 mt-0.5 flex flex-col gap-0.5 border-l border-border/40 pl-3">
          {group.children.map((child, idx) => {
            const active = activeChildHref === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onLinkClick}
                onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => handleChildKeyDown(e, idx)}
                className={cn(
                  "flex items-center px-2 py-1.5 rounded-lg font-tech text-sm transition-colors",
                  active
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
                aria-current={active ? "page" : undefined}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile, onLinkClick }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [openGroups, toggleGroup] = useOpenGroups(location);

  const visibleGroups = NAV_GROUPS.filter((g) => {
    if (!g.roles) return true;
    return user && g.roles.includes(user.role);
  });

  const handleLinkClick = () => {
    onCloseMobile();
    onLinkClick?.();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden py-3">
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 px-2">
          {visibleGroups.map((group) => (
            <IconRailItem
              key={group.id}
              group={group}
              onLinkClick={handleLinkClick}
              location={location}
              active={isGroupActive(location, group)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 px-2">
          {visibleGroups.map((group) => (
            <AccordionGroup
              key={group.id}
              group={group}
              isOpen={openGroups.includes(group.id)}
              isActive={isGroupActive(location, group)}
              activeChildHref={findActiveChild(location, group)}
              onToggle={() => toggleGroup(group.id)}
              onLinkClick={handleLinkClick}
              location={location}
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed top-14 left-0 h-[calc(100vh-3.5rem)] z-40 flex flex-col border-r border-border/40 bg-background/95 backdrop-blur-xl transition-all duration-300",
          "hidden lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
        aria-label="Sidebar navigation"
      >
        {sidebarContent}
      </aside>

      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 z-50 flex flex-col border-r border-border/40 bg-background shadow-2xl transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-border/40">
          <span className="font-display font-bold text-lg tracking-wider">
            GALAXY<span className="text-primary">BOTS</span>
          </span>
          <button
            onClick={onCloseMobile}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0.5 px-2 py-3">
            {visibleGroups.map((group) => (
              <AccordionGroup
                key={group.id}
                group={group}
                isOpen={openGroups.includes(group.id)}
                isActive={isGroupActive(location, group)}
                activeChildHref={findActiveChild(location, group)}
                onToggle={() => toggleGroup(group.id)}
                onLinkClick={handleLinkClick}
                location={location}
              />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
