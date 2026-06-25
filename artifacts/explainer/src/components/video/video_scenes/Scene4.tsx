import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const missions = [
    "Market Research",
    "Security Audit",
    "Competitor Analysis",
    "Campaign Strategy"
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center px-[10vw] z-10"
      initial={{ opacity: 0, y: '20vh' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-[40vw]">
        <motion.div 
          className="text-[2vw] text-[var(--color-primary)] font-heading tracking-widest uppercase mb-2"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        >
          Step 2: Directives
        </motion.div>
        <motion.h2 
          className="text-[5vw] font-display font-bold leading-tight mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          Select Missions
        </motion.h2>
      </div>

      <div className="w-[50vw] pl-[5vw]">
        <div className="grid grid-cols-2 gap-6">
          {missions.map((mission, i) => (
            <motion.div
              key={mission}
              className="bg-white/5 border border-white/10 rounded-xl p-8 backdrop-blur-sm relative overflow-hidden group"
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={phase >= 2 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 30 }}
              transition={{ type: "spring", stiffness: 150, damping: 20, delay: phase >= 2 ? i * 0.15 : 0 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="text-2xl font-heading font-semibold text-white mb-2">{mission}</div>
              <div className="w-12 h-1 bg-[var(--color-primary)]/50 rounded-full" />
              
              {/* Highlight selection of one mission */}
              {i === 2 && phase >= 3 && (
                <motion.div 
                  className="absolute inset-0 border-2 border-[var(--color-primary)] rounded-xl"
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
