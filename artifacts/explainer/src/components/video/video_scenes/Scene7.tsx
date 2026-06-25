import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Rocket, ArrowUpRight } from 'lucide-react';
import { CTA, mainSiteUrl } from '@/content/explainerContent';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 1900),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-[80px]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="relative flex max-w-[940px] flex-col items-center text-center">
        <motion.div
          className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-6 py-2 font-heading text-xl tracking-widest text-[var(--color-primary)]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Rocket className="h-5 w-5" />
          {CTA.eyebrow}
        </motion.div>

        <h1 className="font-display text-[80px] font-bold leading-tight">
          <motion.span
            className="block"
            initial={{ opacity: 0, y: 40 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            Deploy Your
          </motion.span>
          <motion.span
            className="block text-gradient"
            initial={{ opacity: 0, y: 40 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            AI Workforce
          </motion.span>
        </h1>

        <motion.p
          className="mt-6 font-body text-[28px] text-white/70"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {CTA.subtext}
        </motion.p>

        <motion.div
          className="mt-10 flex items-center gap-5"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <a
            href={mainSiteUrl(CTA.primary.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] px-10 py-4 font-heading text-[22px] font-semibold text-[#0B0F19] no-underline transition-transform hover:scale-[1.04]"
          >
            {CTA.primary.label} <ArrowUpRight className="h-6 w-6" />
          </a>
          <a
            href={mainSiteUrl(CTA.secondary.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-white/25 bg-white/5 px-10 py-4 font-heading text-[22px] text-white no-underline backdrop-blur-md transition-colors hover:bg-white/10"
          >
            {CTA.secondary.label}
          </a>
        </motion.div>
      </div>
    </motion.div>
  );
}
