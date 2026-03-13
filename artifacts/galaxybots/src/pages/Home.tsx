import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Bot, Network, Shield, Zap, Radio } from "lucide-react";

export default function Home() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AppLayout>
      <div className="relative w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Deep space corporate background" 
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
        </div>

        <div className="relative z-10 container mx-auto px-4 pt-32 pb-24 sm:pt-40 sm:pb-32">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-tech text-sm mb-6 shadow-[0_0_15px_rgba(123,97,255,0.2)]">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                SYSTEM ONLINE. WAITING FOR DIRECTIVES.
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-8">
                Fortune 500 Intelligence.<br/>
                <span className="text-gradient">Deployed for You.</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                Hire elite AI personalities for every director-level position. 
                They operate 24/7 in the background, architecting your success.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/assembly">
                  <Button variant="glow" size="lg" className="w-full sm:w-auto min-h-[44px] gap-2">
                    <Radio className="w-4 h-4" />
                    Watch the Assembly
                  </Button>
                </Link>
                <Link href="/hire">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[44px]">
                    Hire the Full Company
                  </Button>
                </Link>
                <Link href="/bots">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[44px]">
                    Explore Roster
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="py-24 bg-background relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div 
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
              className="glass-panel p-8 rounded-2xl neon-border"
            >
              <div className="w-12 h-12 rounded-lg bg-cyan/10 flex items-center justify-center mb-6 border border-cyan/20">
                <Bot className="w-6 h-6 text-cyan" />
              </div>
              <h3 className="text-xl font-bold mb-3">60+ Elite Personalities</h3>
              <p className="text-muted-foreground">From CMO to CISO, every role is covered. Specialized AIs trained for deep domain expertise.</p>
            </motion.div>

            <motion.div 
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
              className="glass-panel p-8 rounded-2xl neon-border"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
                <Network className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Inter-Bot Boardroom</h3>
              <p className="text-muted-foreground">They talk to each other. Watch your directors strategize in real-time in the secure boardroom.</p>
            </motion.div>

            <motion.div 
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
              className="glass-panel p-8 rounded-2xl neon-border"
            >
              <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center mb-6 border border-gold/20">
                <Shield className="w-6 h-6 text-gold" />
              </div>
              <h3 className="text-xl font-bold mb-3">Total Governance</h3>
              <p className="text-muted-foreground">You are the CEO. You own the architecture. Absolute control over your virtual conglomerate.</p>
            </motion.div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
