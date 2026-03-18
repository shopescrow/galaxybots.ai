import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { 
  Search, UserCheck, Zap, Building, Globe, ArrowRight, 
  CheckCircle, Clock, Shield, TrendingUp, Users, Bot,
  ChevronRight, Star, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

function AnimatedStep({ step, index }: { step: typeof STEPS[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      initial={prefersReducedMotion ? false : { opacity: 0, x: index % 2 === 0 ? -60 : 60 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.1 }}
      className={`flex flex-col lg:flex-row items-center gap-12 ${index % 2 !== 0 ? "lg:flex-row-reverse" : ""}`}
    >
      <div className="flex-1 space-y-6">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${step.iconBg} border ${step.iconBorder}`}>
            <step.icon className={`w-8 h-8 ${step.iconColor}`} />
          </div>
          <div>
            <div className={`text-xs font-tech font-bold uppercase tracking-widest mb-1 ${step.accentColor}`}>
              Step {index + 1}
            </div>
            <h3 className="text-2xl font-display font-bold">{step.title}</h3>
          </div>
        </div>
        <p className="text-muted-foreground text-lg leading-relaxed">{step.description}</p>
        <ul className="space-y-3">
          {step.details.map((detail, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle className={`w-5 h-5 shrink-0 mt-0.5 ${step.iconColor}`} />
              <span className="text-foreground/80">{detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`flex-1 relative rounded-2xl border ${step.cardBorder} bg-card p-8 overflow-hidden group`}>
        <div className={`absolute inset-0 ${step.glowBg} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <div className="relative z-10">
          {step.visual}
        </div>
      </div>
    </motion.div>
  );
}

const STEPS = [
  {
    icon: Search,
    title: "Browse the Corporate Roster",
    description: "Explore 51 AI director-level personalities spanning every department of a Fortune 500 corporation. Each bot carries deep domain expertise, a unique professional personality, and a precisely defined scope of authority.",
    details: [
      "Filter by department: Operations, Finance, Technology, Sales, Legal, and more",
      "Read full director profiles including responsibilities and strategic orientation",
      "Preview each director's communication style and expertise depth",
    ],
    iconBg: "bg-cyan/10",
    iconBorder: "border-cyan/30",
    iconColor: "text-cyan",
    accentColor: "text-cyan",
    cardBorder: "border-cyan/20",
    glowBg: "bg-gradient-to-br from-cyan/5 to-transparent",
    visual: (
      <div className="space-y-4">
        {[
          { name: "Chairman Atlas", dept: "Board of Directors", color: "text-gold" },
          { name: "Revenue Oracle Max", dept: "Sales & Marketing", color: "text-cyan" },
          { name: "Finance Director Vance", dept: "Finance & Legal", color: "text-primary" },
        ].map((bot, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className={`font-display font-bold text-sm ${bot.color}`}>{bot.name}</div>
              <div className="text-xs text-muted-foreground font-tech">{bot.dept}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </div>
        ))}
        <div className="text-center text-xs text-muted-foreground font-tech pt-2">+ 48 more directors</div>
      </div>
    ),
  },
  {
    icon: UserCheck,
    title: "Select Your Hiring Tier",
    description: "Choose the level of AI executive power your organization needs right now. GalaxyBots.ai's three-tier model scales from a targeted single-director engagement to a full 51-bot Fortune 500 board.",
    details: [
      "Single Director ($999/mo): One specialist for a critical expertise gap",
      "Department Team ($4,999/mo): Up to 5 directors with cross-bot collaboration",
      "Full Board ($9,999/mo): All 51 directors, global boardroom, daily intelligence briefings",
    ],
    iconBg: "bg-primary/10",
    iconBorder: "border-primary/30",
    iconColor: "text-primary",
    accentColor: "text-primary",
    cardBorder: "border-primary/20",
    glowBg: "bg-gradient-to-br from-primary/5 to-transparent",
    visual: (
      <div className="space-y-4">
        {[
          { label: "Single Director", price: "$999/mo", icon: Zap, color: "text-cyan", bg: "bg-cyan/10", border: "border-cyan/20" },
          { label: "Department Team", price: "$4,999/mo", icon: Building, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", recommended: true },
          { label: "Full Board", price: "$9,999/mo", icon: Globe, color: "text-gold", bg: "bg-gold/10", border: "border-gold/20" },
        ].map((tier, i) => (
          <div key={i} className={`relative flex items-center gap-4 p-4 rounded-xl border ${tier.border} ${tier.bg}`}>
            {tier.recommended && (
              <div className="absolute -top-2 right-4 text-xs font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30">
                RECOMMENDED
              </div>
            )}
            <tier.icon className={`w-6 h-6 ${tier.color}`} />
            <div className="flex-1">
              <div className={`font-display font-bold text-sm ${tier.color}`}>{tier.label}</div>
              <div className="text-xs text-muted-foreground">{tier.price}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Building,
    title: "Create Your Client Profile",
    description: "Register your company and your hired bots are immediately linked to your organization. The platform maintains full context of your company's structure, goals, and ongoing strategic initiatives.",
    details: [
      "One-time onboarding captures your company's strategic context",
      "All hired bots share institutional memory of your organization",
      "Manage multiple departments or divisions under a single account",
    ],
    iconBg: "bg-gold/10",
    iconBorder: "border-gold/30",
    iconColor: "text-gold",
    accentColor: "text-gold",
    cardBorder: "border-gold/20",
    glowBg: "bg-gradient-to-br from-gold/5 to-transparent",
    visual: (
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-secondary/50 border border-border/50">
          <div className="text-xs text-muted-foreground font-tech mb-3 uppercase tracking-wider">Client Profile</div>
          <div className="space-y-2">
            {[
              { label: "Company", value: "BingoLingo.ai" },
              { label: "Plan", value: "Department Team" },
              { label: "Status", value: "Active" },
            ].map((field, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-xs text-muted-foreground">{field.label}</span>
                <span className={`text-xs font-tech font-bold ${field.label === "Status" ? "text-cyan" : "text-foreground"}`}>{field.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-gold" />
          <div className="text-sm text-foreground/70">5 directors deployed and active</div>
        </div>
      </div>
    ),
  },
  {
    icon: Zap,
    title: "Deploy & Start Consulting",
    description: "Your AI directors are live the moment you activate your account. Engage them in direct chat, convene the boardroom, or let the platform run daily intelligence briefings automatically.",
    details: [
      "Instant access — no onboarding wait, no delay. Consultation begins immediately.",
      "Private 1:1 chat with any hired director for targeted strategic advice",
      "Multi-bot boardroom sessions for cross-functional strategic synthesis",
      "Daily journal entries surface overnight intelligence automatically",
    ],
    iconBg: "bg-primary/10",
    iconBorder: "border-primary/30",
    iconColor: "text-primary",
    accentColor: "text-primary",
    cardBorder: "border-primary/20",
    glowBg: "bg-gradient-to-br from-primary/5 to-transparent",
    visual: (
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-secondary/50 border border-border/50">
          <div className="text-xs text-muted-foreground font-tech mb-2">Chat with Revenue Oracle Max</div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-xs shrink-0">U</div>
              <div className="bg-foreground/10 rounded-xl rounded-tl-none px-3 py-2 text-xs text-foreground/80">
                What's our Q2 enterprise sales strategy?
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <div className="bg-primary/20 border border-primary/30 rounded-xl rounded-tr-none px-3 py-2 text-xs text-foreground/80">
                Based on your pipeline data, I recommend focusing on 3 verticals with the highest LTV...
              </div>
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Bot className="w-3 h-3 text-primary" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-cyan font-tech">
          <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
          Director is live and active
        </div>
      </div>
    ),
  },
];

const STATS = [
  { icon: Clock, value: "< 2 min", label: "Time to first consultation", color: "text-cyan" },
  { icon: Shield, value: "51", label: "Director-level specializations", color: "text-primary" },
  { icon: TrendingUp, value: "24/7", label: "Always-on strategic intelligence", color: "text-gold" },
  { icon: Star, value: "Fortune 500", label: "Grade of executive advice", color: "text-purple" },
];

export default function HowItWorks() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroInView = useInView(heroRef, { once: true });
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true });
  const prefersReducedMotion = useReducedMotion();

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24 space-y-32">
        
        {/* Hero Section */}
        <motion.div
          ref={heroRef}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
          animate={heroInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReducedMotion ? 0 : 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 text-xs font-tech text-primary uppercase tracking-widest mb-8">
            <Layers className="w-3.5 h-3.5" />
            How It Works
          </div>
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-display font-bold mb-8 leading-tight">
            Fortune 500 Intelligence.<br />
            <span className="text-gradient">Deployed in Minutes.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            From browsing the roster to receiving your first strategic briefing — the GalaxyBots.ai hiring process is designed for speed, precision, and results.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link href="/hire">
              <Button variant="glow" size="lg" className="gap-2">
                Hire Directors Now <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/bots">
              <Button variant="outline" size="lg">Browse the Roster</Button>
            </Link>
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          ref={statsRef}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          animate={statsInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.2  }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9  }}
              animate={statsInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: i * 0.1  }}
              className="flex flex-col items-center text-center p-6 rounded-2xl bg-card border border-border/50 gap-3"
            >
              <stat.icon className={`w-7 h-7 ${stat.color}`} />
              <div className={`text-2xl font-display font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground font-tech">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Infographic Divider */}
        <div className="text-center">
          <div className="inline-flex items-center gap-3 text-muted-foreground">
            <div className="h-px w-24 bg-gradient-to-r from-transparent to-border" />
            <span className="text-sm font-tech uppercase tracking-widest">The Process</span>
            <div className="h-px w-24 bg-gradient-to-l from-transparent to-border" />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-32">
          {STEPS.map((step, index) => (
            <AnimatedStep key={index} step={step} index={index} />
          ))}
        </div>

        {/* Visual Flow Diagram */}
        <div className="relative">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-display font-bold mb-4">The Deployment Pipeline</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">From first contact to full deployment — 4 steps, under 10 minutes.</p>
          </div>

          <div className="relative max-w-4xl mx-auto">
            {/* Connecting line */}
            <div className="absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan via-primary to-gold hidden lg:block" />
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {[
                { num: "01", label: "Browse", sub: "Explore 51 Directors", color: "text-cyan", border: "border-cyan/30", bg: "bg-cyan/10" },
                { num: "02", label: "Select Tier", sub: "Single → Team → Board", color: "text-primary", border: "border-primary/30", bg: "bg-primary/10" },
                { num: "03", label: "Create Profile", sub: "Register Your Company", color: "text-gold", border: "border-gold/30", bg: "bg-gold/10" },
                { num: "04", label: "Deploy", sub: "Consult Immediately", color: "text-purple", border: "border-purple/30", bg: "bg-purple/10" },
              ].map((node, i) => (
                <motion.div
                  key={i}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15  }}
                  className="flex flex-col items-center text-center gap-4"
                >
                  <div className={`relative w-24 h-24 rounded-2xl border-2 ${node.border} ${node.bg} flex items-center justify-center z-10 bg-background`}>
                    <span className={`text-3xl font-display font-bold ${node.color}`}>{node.num}</span>
                  </div>
                  <div>
                    <div className={`font-display font-bold text-lg ${node.color}`}>{node.label}</div>
                    <div className="text-xs text-muted-foreground font-tech mt-1">{node.sub}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl border border-primary/20 p-12 text-center bg-card"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan/5" />
          <div className="relative z-10">
            <Globe className="w-12 h-12 text-gold mx-auto mb-6" />
            <h2 className="text-2xl sm:text-4xl font-display font-bold mb-4">
              Ready to Deploy?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Your AI executive team is assembled and ready. Every Fortune 500 function. Zero recruitment delays. Start in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/hire">
                <Button variant="glow" size="lg" className="gap-2">
                  Choose Your Tier <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/bots">
                <Button variant="outline" size="lg">Meet the Directors</Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
