import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getTerm } from '@/content/explainerContent';
import { TermHotspot } from '../InteractiveTerm';

const roleSlugs = ['cmo', 'ciso', 'cfo', 'coo', 'cto'];

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 1600),
      setTimeout(() => setPhase(5), 3200), // begin exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[100px] gap-[60px] z-10"
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -80, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[480px] shrink-0">
        <motion.h2 
          className="text-[58px] font-display font-bold leading-tight mb-6"
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.6 }}
        >
          Hire <span className="text-[var(--color-secondary)]">Elite</span> AI Personalities
        </motion.h2>
        
        <motion.p 
          className="text-[26px] text-white/70 font-body leading-relaxed max-w-[440px]"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          60+ specialized directors operating 24/7 in the background. Architecting your success.
        </motion.p>
      </div>

      <div
        className="w-[512px] shrink-0 flex flex-col justify-center gap-3"
        style={{ perspective: '1000px' }}
      >
        {roleSlugs.map((slug, i) => {
          const role = getTerm(slug);
          if (!role) return null;
          return (
            <motion.div
              key={slug}
              className="relative w-full bg-white/5 border border-white/20 rounded-xl backdrop-blur-md flex items-center px-8 py-5"
              initial={{ opacity: 0, z: -200, rotateX: 20, y: 50 }}
              animate={phase >= 3 ? { opacity: 1, z: 0, rotateX: 0, y: 0 } : { opacity: 0, z: -200, rotateX: 20, y: 50 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: phase >= 3 ? i * 0.1 : 0 }}
            >
              <div className="flex items-center gap-5">
                <div className="w-4 h-4 rounded-full bg-[var(--color-secondary)] animate-pulse shrink-0" />
                <div className="flex flex-col">
                  <span className="text-3xl font-heading font-bold leading-tight">{role.term}</span>
                  <span className="text-[15px] text-white/50 font-body leading-tight">{role.h2Label}</span>
                </div>
              </div>
              <TermHotspot slug={slug} revealOnHover={false} />
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
