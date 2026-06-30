import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu, Settings, Search, LogOut, User, CheckCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "../ui/button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { usePartner } from "@/contexts/PartnerContext";
import { useAuth } from "@/contexts/AuthContext";
import logoImg from "@assets/galaxybots-logo-transparent.png";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

interface TopBarProps {
  onSidebarToggle: () => void;
  onMobileToggle: () => void;
  onOpenPalette?: () => void;
  sidebarCollapsed?: boolean;
  mobileOpen?: boolean;
}

function UserAvatar() {
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
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-tech font-bold transition-all duration-200 hover:scale-105"
        style={{
          color: "hsl(270 80% 75%)",
          background: "hsl(270 80% 60% / 0.12)",
          border: "1px solid hsl(270 80% 60% / 0.35)",
          boxShadow: "0 0 12px hsl(270 80% 60% / 0.18)",
        }}
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initials}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-2xl shadow-2xl py-1 z-50 backdrop-blur-xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(230 45% 6%) 0%, hsl(240 40% 5%) 100%)",
            border: "1px solid hsl(270 80% 60% / 0.18)",
            boxShadow: "0 20px 60px hsl(230 50% 2% / 0.8), 0 0 0 1px hsl(270 80% 60% / 0.06)",
          }}
        >
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid hsl(270 80% 60% / 0.1)" }}>
            <p className="text-xs font-tech font-semibold text-foreground truncate">
              {user.displayName || user.email}
            </p>
            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{user.email}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            Profile & Settings
          </Link>
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export const ONBOARDING_STEP_KEYS = ["companyProfile", "firstClient", "industry", "integrations", "firstMission"] as const;

export function ResumeSetupPrompt() {
  const { user } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const onboarding = user?.onboarding;

  if (!onboarding || onboarding.dismissed || onboarding.completedAt) return null;

  const completed = ONBOARDING_STEP_KEYS.filter((k) => onboarding[k]).length;
  const total = ONBOARDING_STEP_KEYS.length;

  if (completed === total) return null;

  const remaining = total - completed;

  return (
    <>
      <div
        className="fixed top-14 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 py-2 text-sm"
        style={{
          background: "hsl(270 80% 60% / 0.08)",
          borderBottom: "1px solid hsl(270 80% 60% / 0.18)",
        }}
      >
        <div className="flex items-center gap-2 text-xs font-medium min-w-0" style={{ color: "hsl(270 80% 75%)" }}>
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">
            <span className="hidden sm:inline">Setup in progress — </span>
            {remaining} step{remaining !== 1 ? "s" : ""} remaining
          </span>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105"
          style={{
            background: "hsl(270 80% 60%)",
            color: "white",
          }}
        >
          Continue Setup
        </button>
      </div>
      <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}

function OnboardingProgressBadge() {
  const { user } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const onboarding = user?.onboarding;

  if (!onboarding || onboarding.dismissed || onboarding.completedAt) return null;

  const completed = ONBOARDING_STEP_KEYS.filter((k) => onboarding[k]).length;
  const total = ONBOARDING_STEP_KEYS.length;
  const percent = Math.round((completed / total) * 100);

  if (completed === total) return null;

  return (
    <>
      <button
        onClick={() => setWizardOpen(true)}
        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105"
        style={{
          background: "hsl(270 80% 60% / 0.1)",
          border: "1px solid hsl(270 80% 60% / 0.25)",
          color: "hsl(270 80% 75%)",
        }}
        aria-label={`Setup ${percent}% complete — click to continue`}
      >
        <CheckCircle className="w-3.5 h-3.5" />
        <span>{percent}%</span>
      </button>
      <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}

export function TopBar({ onSidebarToggle, onMobileToggle, onOpenPalette, sidebarCollapsed, mobileOpen }: TopBarProps) {
  const { preferences } = useUserPreferences();
  const { partner } = usePartner();
  const { user } = useAuth();

  const displayLogo = partner?.partnerLogo || preferences?.logoUrl || logoImg;
  const displayName = partner?.partnerName || null;
  const homeHref = user ? "/atrium" : "/";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-3 gap-3 supports-[backdrop-filter]:backdrop-blur-xl"
      style={{
        background: "linear-gradient(180deg, hsl(230 52% 4%) 0%, hsl(235 48% 3.5%) 100%)",
        borderBottom: "1px solid hsl(270 80% 60% / 0.12)",
        boxShadow: "0 1px 0 hsl(190 90% 50% / 0.04), 0 4px 30px hsl(230 52% 2% / 0.7)",
      }}
    >
      {/* Mobile menu toggle */}
      <button
        onClick={onMobileToggle}
        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors"
        aria-label="Toggle navigation menu"
        aria-expanded={mobileOpen ?? false}
        aria-controls="mobile-nav"
      >
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Desktop sidebar toggle */}
      <button
        onClick={onSidebarToggle}
        className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 min-w-[40px] min-h-[40px] items-center justify-center transition-colors"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!sidebarCollapsed}
        aria-controls="galaxy-sidebar"
      >
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Logo */}
      <Link href={homeHref} className="flex items-center gap-2.5 group min-w-0">
        <div className="relative shrink-0">
          <img
            src={displayLogo}
            alt={displayName || "GalaxyBots.ai"}
            className="w-8 h-8 rounded-xl object-cover transition-all duration-300 group-hover:scale-105"
          />
          <div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ boxShadow: "0 0 18px hsl(270 80% 60% / 0.5)", border: "1px solid hsl(270 80% 60% / 0.3)" }}
          />
        </div>
        {displayName ? (
          <span className="font-display font-bold text-lg tracking-wider text-foreground truncate">
            {displayName}
          </span>
        ) : (
          <span className="font-display font-bold text-lg tracking-wider text-foreground hidden sm:block">
            GALAXY<span
              style={{
                color: "hsl(270 80% 65%)",
                textShadow: "0 0 20px hsl(270 80% 60% / 0.45)",
              }}
            >BOTS</span>
          </span>
        )}
      </Link>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Command palette — holographic scanner */}
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-all duration-200 font-tech"
          style={{
            background: "hsl(230 40% 7%)",
            border: "1px solid hsl(270 80% 60% / 0.18)",
            boxShadow: "0 0 12px hsl(270 80% 60% / 0.05), inset 0 1px 0 hsl(270 80% 60% / 0.06)",
          }}
          aria-label="Search (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5" style={{ color: "hsl(270 80% 60% / 0.7)" }} />
          <span className="text-xs hidden md:block">Search</span>
          <kbd
            className="hidden md:flex text-[10px] rounded px-1.5 py-0.5 ml-1 font-mono opacity-50"
            style={{ border: "1px solid hsl(270 80% 60% / 0.2)", color: "hsl(270 80% 70%)" }}
          >
            ⌘K
          </kbd>
        </button>

        {/* Mobile search */}
        <button
          onClick={onOpenPalette}
          className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        {user && <NotificationBell />}
        <LanguageSelector />

        <Link href="/settings">
          <Button
            variant="ghost"
            size="sm"
            className="font-tech text-xs min-h-[40px] min-w-[40px] px-2 text-muted-foreground hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </Link>

        <OnboardingProgressBadge />
        <UserAvatar />
      </div>
    </header>
  );
}
