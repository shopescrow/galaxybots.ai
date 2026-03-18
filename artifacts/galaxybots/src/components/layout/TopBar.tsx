import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu, Settings, Search, LogOut, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "../ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { usePartner } from "@/contexts/PartnerContext";
import { useAuth } from "@/contexts/AuthContext";
import logoImg from "@assets/galaxybots-logo-transparent.png";

interface TopBarProps {
  onSidebarToggle: () => void;
  onMobileToggle: () => void;
  onOpenPalette?: () => void;
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

export function TopBar({ onSidebarToggle, onMobileToggle, onOpenPalette }: TopBarProps) {
  const { preferences } = useUserPreferences();
  const { partner } = usePartner();

  const displayLogo = partner?.partnerLogo || preferences?.logoUrl || logoImg;
  const displayName = partner?.partnerName || null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center border-b border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 supports-[backdrop-filter]:backdrop-blur-xl px-3 gap-3">
      <button
        onClick={onMobileToggle}
        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 min-w-[40px] min-h-[40px] flex items-center justify-center"
        aria-label="Toggle navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      <button
        onClick={onSidebarToggle}
        className="hidden lg:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 min-w-[40px] min-h-[40px] items-center justify-center"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      <Link href="/" className="flex items-center gap-2.5 group min-w-0">
        <img
          src={displayLogo}
          alt={displayName || "GalaxyBots.ai"}
          className="w-8 h-8 rounded-xl object-cover shrink-0"
        />
        {displayName ? (
          <span className="font-display font-bold text-lg tracking-wider text-foreground truncate">
            {displayName}
          </span>
        ) : (
          <span className="font-display font-bold text-lg tracking-wider text-foreground hidden sm:block">
            GALAXY<span className="text-primary">BOTS</span>
          </span>
        )}
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/40 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="font-tech text-xs hidden md:block">Search</span>
          <kbd className="hidden md:flex text-[10px] border border-border/60 rounded px-1 py-0.5 ml-1">⌘K</kbd>
        </button>
        <button
          onClick={onOpenPalette}
          className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        <NotificationBell />
        <LanguageSelector />
        <Link href="/settings">
          <Button
            variant="ghost"
            size="sm"
            className="font-tech text-xs min-h-[40px] min-w-[40px] px-2"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
        <UserAvatar />
      </div>
    </header>
  );
}
