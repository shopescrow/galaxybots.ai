import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { TermHotspot, TermChip } from '../InteractiveTerm';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center flex-col z-10 px-[80px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(30px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Background pulse / overlay to converge focus */}
      <motion.div 
        className="absolute inset-0 bg-[var(--color-bg-light)]/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />

      <div className="relative text-center flex flex-col items-center">
        <motion.div
          className="w-32 h-32 mb-6 relative"
          initial={{ scale: 0, rotate: -180 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -180 }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
        >
          <div className="absolute inset-0 rounded-full border-4 border-t-[var(--color-primary)] border-r-[var(--color-secondary)] border-b-[var(--color-accent)] border-l-transparent animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-4 rounded-full bg-[var(--color-primary)]/20 backdrop-blur-md flex items-center justify-center">
            <span className="text-5xl font-display font-bold text-gradient">G</span>
          </div>
        </motion.div>

        <motion.h2 
          className="text-[77px] font-display font-bold leading-tight mb-5"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          Total <span className="text-gradient">Governance</span>.
        </motion.h2>

        <motion.p
          className="text-[32px] text-white/70 font-body max-w-[800px] mb-5"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          You set the strategy. They execute the vision.
        </motion.p>

        <motion.div
          className="mb-7"
          initial={{ opacity: 0, y: 12 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <TermChip slug="total-governance" label="Define: Total Governance" />
        </motion.div>

        <motion.div
          className="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-10 py-5 text-[38px] font-bold max-w-[1000px]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-[var(--color-primary)]">24/7 Outcomes.</span>
          <span className="text-white/30">/</span>
          <span className="text-[var(--color-secondary)]">Absolute Control.</span>
          <TermHotspot slug="outcomes-control" />
        </motion.div>

        <motion.div
          className="relative mt-8 inline-flex items-center gap-4 rounded-full border border-[var(--color-secondary)]/40 bg-white/5 py-4 pl-8 pr-14 backdrop-blur-md"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <ShieldCheck className="w-9 h-9 text-[var(--color-secondary)] shrink-0" />
          <span className="text-[22px] font-heading text-white/80 tracking-wide whitespace-nowrap">
            GalaxyBots.ai operates within{' '}
            <span className="text-white font-semibold">ISO-27001</span> &{' '}
            <span className="text-white font-semibold">SOC-2</span> compliance parameters.
          </span>
          <TermHotspot slug="compliance" revealOnHover={false} />
        </motion.div>
      </div>
    </motion.div>
  );
}
