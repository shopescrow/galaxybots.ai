import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { motion } from "framer-motion";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden">
      <Navbar />
      <main className="flex-1 flex flex-col">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex-1 h-full"
        >
          {children}
        </motion.div>
      </main>
      
      <footer className="border-t border-border/40 py-10 bg-background/80 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mb-4 text-xs font-tech text-muted-foreground">
            <a href="/how-it-works" className="hover:text-primary transition-colors">How It Works</a>
            <a href="/blog" className="hover:text-primary transition-colors">Blog</a>
            <a href="/hire" className="hover:text-primary transition-colors">Hire Directors</a>
            <a href="/bots" className="hover:text-primary transition-colors">Roster</a>
            <a href="/partner/bingolingo" className="hover:text-gold transition-colors">BingoLingo.ai Partner</a>
            <a href="/valuation" className="hover:text-cyan transition-colors">5-Year Projections</a>
          </div>
          <p className="text-center text-xs text-muted-foreground font-tech">
            © 2026 GalaxyBots.ai — White Label Corporate AI Infrastructure. Strictly Confidential. Property of Ahmed Y. Hammoud.
          </p>
        </div>
      </footer>
    </div>
  );
}
