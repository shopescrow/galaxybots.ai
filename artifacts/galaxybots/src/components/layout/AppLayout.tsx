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
      
      <footer className="border-t border-border/40 py-8 bg-background/80 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground font-tech">
          <p>© 2025 GalaxyBots.ai — White Label Corporate AI Infrastructure. Strictly Confidential.</p>
        </div>
      </footer>
    </div>
  );
}
