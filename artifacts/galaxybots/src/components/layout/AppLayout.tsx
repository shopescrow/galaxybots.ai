import { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { usePartner } from "@/contexts/PartnerContext";
import { useSidebarState } from "@/hooks/useSidebarState";

export function AppLayout({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const { partner } = usePartner();
  const { collapsed, toggle, mobileOpen, closeMobile, toggleMobile } = useSidebarState();

  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <TopBar onSidebarToggle={toggle} onMobileToggle={toggleMobile} />

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <div
        className={cn(
          "flex flex-col flex-1 transition-all duration-300 pt-14",
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
              <a href="/blog" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Blog</a>
              <a href="/hire" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Hire Directors</a>
              <a href="/bots" className="hover:text-primary transition-colors min-h-[44px] flex items-center">Roster</a>
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
    </div>
  );
}
