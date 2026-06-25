import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 2100),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center flex-col z-10 px-[80px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="relative text-center flex flex-col items-center">
        <motion.div
          className="text-[26px] text-[var(--color-accent)] font-heading tracking-[0.3em] uppercase mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          GalaxyBots.ai
        </motion.div>

        <h1 className="text-[88px] font-display font-bold leading-tight">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            The Secret Behind
          </motion.div>
          <motion.div
            className="text-gradient"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 150, damping: 18 }}
          >
            Success.
          </motion.div>
        </h1>

        <motion.div
          className="mt-8 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent"
          initial={{ width: 0, opacity: 0 }}
          animate={phase >= 3 ? { width: 420, opacity: 1 } : { width: 0, opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}
