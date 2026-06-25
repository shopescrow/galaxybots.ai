import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center flex-col z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-20vh' }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute top-[15vh] left-[10vw]">
        <motion.div 
          className="text-[2vw] text-[var(--color-accent)] font-heading tracking-widest uppercase mb-2"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        >
          Step 1: Onboard
        </motion.div>
        <motion.h2 
          className="text-[5vw] font-display font-bold leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          Watch the Assembly
        </motion.h2>
      </div>

      <div className="relative w-[70vw] h-[40vh] mt-[20vh]">
        {/* Abstract representation of the AI core assembling */}
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/ai-core.png`}
          alt="AI Core"
          className="absolute inset-0 w-full h-full object-contain"
          initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1.2, rotate: 0 } : { opacity: 0, scale: 0.5, rotate: -20 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        />
        
        <motion.div
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/40 backdrop-blur-xl border border-[var(--color-secondary)]/30 p-8 rounded-2xl"
          initial={{ opacity: 0, x: 100 }}
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 100 }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        >
          <div className="text-3xl font-heading text-[var(--color-secondary)] mb-2">Hire the Full Company</div>
          <div className="text-xl text-white/70">1-Click deployment of all critical roles.</div>
        </motion.div>
      </div>

    </motion.div>
  );
}
