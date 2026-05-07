import { ReactNode, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { TopBar, ResumeSetupPrompt, ONBOARDING_STEP_KEYS } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { usePartner } from "@/contexts/PartnerContext";
import { useSidebarState } from "@/hooks/useSidebarState";
import { CommandPalette, addRecentPage } from "@/components/command/CommandPalette";
import { KeyboardShortcuts } from "@/components/command/KeyboardShortcuts";
import { AeoScanModal } from "@/components/command/AeoScanModal";
import { useClients } from "@/hooks/use-clients";
import { useActiveClient } from "@/contexts/ActiveClientContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const PATH_LABELS: Record<string, string> = {
  "/command-center": "Command Center",
  "/bots": "Bot Roster",
  "/clients": "Clients",
  "/analytics": "Analytics",
  "/deploy-team": "Deploy Team",
  "/task-rooms": "Task Rooms",
  "/boardroom": "Boardroom",
  "/knowledge-base": "Knowledge Base",
  "/documents": "Documents",
  "/pipelines": "Pipelines",
  "/compliance": "Compliance",
  "/governance": "Governance",
  "/billing": "Billing",
  "/proposals": "Proposals",
  "/prospects": "Prospects",
  "/prospector": "Prospector",
  "/integrations": "Integrations",
  "/marketplace": "Marketplace",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/journal": "Journal",
  "/scenarios": "Scenarios",
  "/roi": "ROI Dashboard",
};

function getPageLabel(path: string): string {
  const clean = path.split("?")[0];
  if (PATH_LABELS[clean]) return PATH_LABELS[clean];
  const botMatch = clean.match(/^\/bots\/(\d+)/);
  if (botMatch) return "Bot Detail";
  const clientMatch = clean.match(/^\/clients\/(\d+)/);
  if (clientMatch) return "Client Detail";
  const taskRoomMatch = clean.match(/^\/task-rooms\/(\d+)/);
  if (taskRoomMatch) return "Task Room";
  return clean.replace(/^\//, "").replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "Home";
}

export function AppLayout({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const { partner } = usePartner();
  const { collapsed, toggle, mobileOpen, closeMobile, toggleMobile } = useSidebarState();
  const [location, navigate] = useLocation();
  const { data: clients } = useClients();
  const { setActiveClient } = useActiveClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const ob = user?.onboarding;
  const showResumeBanner = !!ob && !ob.dismissed && !ob.completedAt &&
    ONBOARDING_STEP_KEYS.filter((k) => ob[k]).length < ONBOARDING_STEP_KEYS.length;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aeoScanOpen, setAeoScanOpen] = useState(false);

  useEffect(() => {
    const path = location;
    if (path && path !== "/" && !path.startsWith("/auth")) {
      addRecentPage(path, getPageLabel(path));
    }
  }, [location]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (!isInput && (e.key === "?" || (e.shiftKey && e.key === "/")) && !meta) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (!user) return;

      if (meta && e.key === "b") {
        e.preventDefault();
        navigate("/boardroom");
        return;
      }

      if (meta && e.key === "d") {
        e.preventDefault();
        navigate("/deploy-team");
        return;
      }

      const num = parseInt(e.key);
      if (meta && num >= 1 && num <= 9) {
        e.preventDefault();
        const clientList = (clients as { data?: Array<{ id: number; companyName?: string; name?: string }> } | undefined)?.data;
        if (clientList && clientList.length > 0) {
          const idx = num - 1;
          const client = clientList[idx];
          if (client) {
            const displayName = client.companyName || client.name || `Client ${client.id}`;
            setActiveClient(client.id, displayName);
            addRecentPage(`/clients/${client.id}`, displayName);
            navigate(`/clients/${client.id}`);
            toast({ title: `Switched to ${displayName}`, description: `⌘${num} quick-switch` });
          }
        }
        return;
      }
    },
    [user, navigate, clients, setActiveClient, toast]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <TopBar onSidebarToggle={toggle} onMobileToggle={toggleMobile} onOpenPalette={() => setPaletteOpen(true)} />
      <ResumeSetupPrompt />

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <div
        className={cn(
          "flex flex-col flex-1 transition-all duration-300",
          showResumeBanner ? "pt-[88px]" : "pt-14",
          "lg:ml-60",
          collapsed && "lg:ml-16"
        )}
      >
        <main className="flex-1 flex flex-col">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
            className="flex-1 h-full content-scroll"
          >
            {children}
          </motion.div>
        </main>

        <footer className="border-t border-border/40 py-10 bg-background/80 mt-auto pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-4 text-xs font-tech text-muted-foreground">
              <a href="/how-it-works" className="hover:text-primary transition-colors min-h-[44px] flex items-center">How It Works</a>
              <a href="/pricing" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Pricing</a>
              <a href="/blog" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Blog</a>
              <a href="/hire" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Hire Directors</a>
              <a href="/bots" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Roster</a>
              <a href="/partner-apply" className="hover:text-gold transition-colors min-h-[44px] flex items-center">Partner Program</a>
              <a href="/partner/bingolingo" className="hover:text-gold transition-colors min-h-[44px] flex items-center">BingoLingo.ai Partner</a>
              <a href="/valuation" className="hover:text-cyan transition-colors min-h-[44px] flex items-center">5-Year Projections</a>
              <a href="/developers" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Developers</a>
            </div>
            {partner ? (
              <p className="text-center text-xs text-muted-foreground font-tech">
                Powered by <a href="/" className="hover:text-primary transition-colors">GalaxyBots.ai</a>
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground font-tech">
                © 2026 GalaxyBots.ai — White Label Corporate AI Infrastructure. Strictly Confidential. Property of Gifted Productions Inc.
              </p>
            )}
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenAeoScan={() => setAeoScanOpen(true)} />
      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AeoScanModal open={aeoScanOpen} onOpenChange={setAeoScanOpen} />
    </div>
  );
}
