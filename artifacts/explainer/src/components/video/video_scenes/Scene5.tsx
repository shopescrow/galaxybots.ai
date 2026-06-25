import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 3800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, filter: 'blur(20px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 bg-[var(--color-bg-light)]/80 backdrop-blur-sm z-0" />
      
      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.div
          className="w-32 h-32 mb-8 relative"
          initial={{ scale: 0, rotate: -90 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -90 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="absolute inset-0 border-4 border-[var(--color-secondary)] rounded-full border-t-transparent animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-4 border-4 border-[var(--color-primary)] rounded-full border-b-transparent animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-white rounded-full shadow-[0_0_30px_#fff]" />
          </div>
        </motion.div>

        <motion.h2 
          className="text-[6vw] font-display font-bold leading-none mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          Total Governance
        </motion.h2>

        <motion.div 
          className="text-[2.5vw] text-white/80 font-heading mb-12"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
          Watch your directors strategize in real-time.
        </motion.div>

        <motion.div
          className="flex items-center gap-8 text-[3vw] font-bold"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <span className="text-[var(--color-secondary)]">24/7 Outcomes.</span>
          <span className="text-white/30">/</span>
          <span className="text-[var(--color-primary)]">Absolute Control.</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
