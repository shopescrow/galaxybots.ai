import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu, X, Settings, Sparkles, ChevronRight, LogOut, User } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "../ui/button";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePartner } from "@/contexts/PartnerContext";
import logoImg from "@assets/galaxybots-logo-transparent.png";

function NavbarUserAvatar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const initials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-tech font-bold text-primary hover:bg-primary/30 transition-colors"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl py-1 z-50">
          <div className="px-3 py-2 border-b border-border/40">
            <p className="text-xs font-tech font-semibold text-foreground truncate">
              {user.displayName || user.email}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            Profile & Settings
          </Link>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface NavLink {
  href: string;
  label: string;
  roles?: string[];
  external?: boolean;
  icon?: (props: { className?: string }) => JSX.Element;
}

interface NavGroup {
  label: string;
  links: NavLink[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Core",
    links: [
      { href: "/command-center", label: "Command Center", roles: ["owner", "admin"] },
      { href: "/assembly", label: "Assembly" },
      { href: "/bots", label: "Roster" },
      { href: "/boardroom", label: "Boardroom" },
      { href: "/task-rooms", label: "Task Rooms" },
      { href: "/scenarios", label: "Scenarios" },
      { href: "/journal", label: "Journal" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/clients", label: "Clients" },
      { href: "/compliance", label: "Compliance" },
      { href: "/integrations", label: "Integrations" },
      { href: "/bingolingo/", label: "BingoLingo", external: true, icon: Sparkles as (props: { className?: string }) => JSX.Element },
      { href: "/prospects", label: "Prospects" },
      { href: "/governance", label: "Governance" },
    ],
  },
  {
    label: "Admin",
    links: [
      { href: "/knowledge-base", label: "Knowledge Base" },
      { href: "/documents", label: "Documents" },
      { href: "/proposals", label: "Proposals" },
      { href: "/pipelines", label: "Pipelines" },
      { href: "/analytics", label: "Analytics" },
      { href: "/causal-model", label: "Causal Model" },
      { href: "/billing", label: "Billing" },
    ],
  },
];

const ALL_NAV_LINKS: NavLink[] = NAV_GROUPS.flatMap((g) => g.links);

function filterByRole(links: NavLink[], userRole?: string): NavLink[] {
  return links.filter((link) => {
    if (!link.roles || link.roles.length === 0) return true;
    return userRole !== undefined && link.roles.includes(userRole);
  });
}

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const { preferences } = useUserPreferences();
  const { user, logout } = useAuth();
  const { partner } = usePartner();

  const NAV_LINKS = useMemo(
    () => filterByRole(ALL_NAV_LINKS, user?.role),
    [user]
  );

  const MOBILE_GROUPS = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        links: filterByRole(group.links, user?.role),
      })).filter((g) => g.links.length > 0),
    [user]
  );

  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const updateFades = () => {
    const el = navScrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 8);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFades);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(updateFades);
  }, [NAV_LINKS]);

  const displayLogo = partner?.partnerLogo || preferences?.logoUrl || logoImg;
  const displayName = partner?.partnerName || null;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 supports-[backdrop-filter]:backdrop-blur-xl">
        <div className="h-20 flex items-center px-4 sm:px-6 gap-3">

          {/* Logo — always fixed */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <img src={displayLogo} alt={displayName || "GalaxyBots.ai"} className="w-9 h-9 rounded-xl object-cover" />
            {displayName ? (
              <span className="font-display font-bold text-lg tracking-wider text-foreground hidden sm:inline">{displayName}</span>
            ) : (
              <span className="font-display font-bold text-lg tracking-wider text-foreground hidden sm:inline">
                GALAXY<span className="text-primary">BOTS</span>
              </span>
            )}
          </Link>

          {/* Desktop nav — horizontally scrollable, with fade indicators */}
          <div className="hidden md:flex flex-1 min-w-0 relative">
            {showLeftFade && (
              <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-background/95 to-transparent" />
            )}
            <div
              ref={navScrollRef}
              className="flex items-center gap-0.5 font-tech text-sm font-medium overflow-x-auto scrollbar-hide scroll-smooth"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {NAV_LINKS.map((link) => {
                const classes = cn(
                  "px-3 py-2 rounded-lg transition-all duration-200 min-h-[44px] flex items-center gap-1.5 whitespace-nowrap shrink-0",
                  location.startsWith(link.href)
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                );
                const IconComp = link.icon;
                if (link.external) {
                  return (
                    <a key={link.href} href={link.href} className={classes}>
                      {IconComp && <IconComp className="w-3.5 h-3.5" />}
                      {link.label}
                    </a>
                  );
                }
                return (
                  <Link key={link.href} href={link.href} className={classes}>
                    {link.label}
                  </Link>
                );
              })}
            </div>
            {showRightFade && (
              <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l from-background/95 to-transparent" />
            )}
          </div>

          {/* Right actions — always fixed */}
          <div className="hidden md:flex items-center gap-2 shrink-0 ml-auto">
            {user && <NotificationBell />}
            <LanguageSelector />
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="font-tech text-xs min-h-[44px] gap-1">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button variant="outline" size="sm" className="font-tech text-xs min-h-[44px]">How It Works</Button>
            </Link>
            <Link href="/hire">
              <Button variant="glow" className="min-h-[44px]">Hire Directors</Button>
            </Link>
            <NavbarUserAvatar />
          </div>

          {/* Mobile: notification + hamburger */}
          <div className="md:hidden flex items-center gap-1 ml-auto shrink-0">
            {user && <NotificationBell />}
            <button
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-colors"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setIsOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        </div>
      )}

      {/* Mobile side drawer */}
      <div className={cn(
        "md:hidden fixed top-0 right-0 bottom-0 z-50 w-72 max-w-[85vw] bg-background border-l border-border/40 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Drawer header */}
        <div className="h-20 flex items-center justify-between px-4 border-b border-border/40 shrink-0">
          <span className="font-display font-bold tracking-wider text-foreground">
            GALAXY<span className="text-primary">BOTS</span>
          </span>
          <button
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-colors"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable nav content */}
        <div className="flex-1 overflow-y-auto py-4">
          {MOBILE_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="px-4 pb-2">
                <span className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground/60">{group.label}</span>
              </div>
              {group.links.map((link) => {
                const isActive = location.startsWith(link.href);
                const mobileClasses = cn(
                  "mx-2 px-3 py-3 rounded-lg transition-colors font-tech font-medium min-h-[44px] flex items-center gap-2.5 text-sm",
                  isActive
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                );
                const MobileIcon = link.icon;
                if (link.external) {
                  return (
                    <a key={link.href} href={link.href} className={mobileClasses} onClick={() => setIsOpen(false)}>
                      {MobileIcon && <MobileIcon className="w-4 h-4 shrink-0" />}
                      {link.label}
                      {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 opacity-50" />}
                    </a>
                  );
                }
                return (
                  <Link key={link.href} href={link.href} className={mobileClasses} onClick={() => setIsOpen(false)}>
                    {MobileIcon && <MobileIcon className="w-4 h-4 shrink-0" />}
                    {link.label}
                    {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 opacity-50" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Drawer footer */}
        <div className="border-t border-border/40 p-4 space-y-2 shrink-0" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="flex items-center gap-2 mb-3">
            <LanguageSelector />
            <Link href="/settings" onClick={() => setIsOpen(false)}>
              <Button variant="ghost" size="sm" className="font-tech text-xs min-h-[44px] gap-1.5">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
          </div>
          <Link href="/how-it-works" onClick={() => setIsOpen(false)}>
            <Button variant="outline" className="w-full font-tech text-sm min-h-[44px]">How It Works</Button>
          </Link>
          <Link href="/hire" onClick={() => setIsOpen(false)}>
            <Button variant="glow" className="w-full min-h-[44px]">Hire Directors</Button>
          </Link>
          {user && (
            <Button
              variant="ghost"
              className="w-full font-tech text-sm min-h-[44px] text-muted-foreground hover:text-foreground gap-2"
              onClick={() => { setIsOpen(false); logout(); }}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
