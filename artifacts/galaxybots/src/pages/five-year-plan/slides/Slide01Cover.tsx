import React from 'react';
import { motion } from 'framer-motion';

export default function Slide01Cover() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="w-24 h-24 bg-gradient-to-br from-[#3D7FE8] to-[#D4A853] rounded-3xl mx-auto shadow-2xl flex items-center justify-center p-4">
          <div className="w-full h-full bg-[#08091A] rounded-2xl flex items-center justify-center text-2xl font-display font-bold">GB</div>
        </div>
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="text-6xl font-display font-bold mb-4"
      >
        GalaxyBots<span className="text-[#3D7FE8]">.ai</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="text-2xl font-tech text-[#D4A853] tracking-widest uppercase mb-12"
      >
        Fortune 500 Intelligence. For Everyone.
      </motion.p>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex gap-12 text-sm font-tech text-muted-foreground"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[#E8EAF0]">March 2026</span>
          <span>STRATEGIC PLAN</span>
        </div>
        <div className="w-px h-10 bg-border/40" />
        <div className="flex flex-col gap-1">
          <span className="text-[#E8EAF0]">v1.4.2</span>
          <span>INTERNAL ONLY</span>
        </div>
      </motion.div>
    </div>
  );
}
