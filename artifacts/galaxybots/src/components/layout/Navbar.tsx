import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu, X, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import logoImg from "@assets/galaxybots-logo-transparent.png";

const NAV_LINKS = [
  { href: "/assembly", label: "Assembly" },
  { href: "/bots", label: "Roster" },
  { href: "/boardroom", label: "Boardroom" },
  { href: "/task-rooms", label: "Task Rooms" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/journal", label: "Journal" },
  { href: "/blog", label: "Blog" },
  { href: "/clients", label: "Clients" },
  { href: "/compliance", label: "Compliance" },
  { href: "/integrations", label: "Integrations" },
  { href: "/prospects", label: "Prospects" },
  { href: "/governance", label: "Governance" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/billing", label: "Billing" },
];

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { preferences } = useUserPreferences();

  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const displayLogo = preferences?.logoUrl || logoImg;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 supports-[backdrop-filter]:backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <img src={displayLogo} alt="GalaxyBots.ai" className="w-10 h-10 rounded-xl object-cover" />
            <span className="font-display font-bold text-xl tracking-wider text-foreground">
              GALAXY<span className="text-primary">BOTS</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 font-tech text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg transition-all duration-200 min-h-[44px] flex items-center",
                  location.startsWith(link.href)
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
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
        </div>

        <button 
          className="md:hidden p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-background border-b border-border/40 p-4 flex flex-col gap-2 shadow-2xl">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-4 py-3 rounded-lg transition-colors font-tech font-medium min-h-[44px] flex items-center",
                location.startsWith(link.href)
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="h-px bg-border/50 my-2" />
          <div className="px-4 py-2">
            <LanguageSelector />
          </div>
          <Link href="/settings">
            <Button variant="ghost" className="w-full font-tech text-sm min-h-[44px] gap-2 justify-start">
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </Link>
          <Link href="/how-it-works">
            <Button variant="outline" className="w-full font-tech text-sm min-h-[44px]">How It Works</Button>
          </Link>
          <Link href="/hire">
            <Button variant="glow" className="w-full min-h-[44px]">Hire Directors</Button>
          </Link>
        </div>
      )}
    </header>
  );
}
