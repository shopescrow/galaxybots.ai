import React from 'react';
import { motion } from 'framer-motion';

export default function Slide02ExecSummary() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-8 border-b border-border/40 pb-4">
        Executive Summary
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-8">
          <div>
            <h3 className="text-[#D4A853] font-tech uppercase tracking-widest mb-2">Our Mission</h3>
            <p className="text-xl leading-relaxed">
              To build the world's largest fleet of autonomous AI executives, making high-level strategic intelligence accessible to every business on Earth.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-xl border border-border/20">
              <span className="block text-3xl font-bold mb-1">$1.2M</span>
              <span className="text-xs font-tech text-muted-foreground uppercase">Year 1 Target ARR</span>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-border/20">
              <span className="block text-3xl font-bold mb-1">51+</span>
              <span className="text-xs font-tech text-muted-foreground uppercase">AI Directors</span>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="text-[#3D7FE8] font-tech uppercase tracking-widest mb-4">Core Product Suite</h3>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#3D7FE8] mt-2" />
              <div>
                <strong className="block text-[#E8EAF0]">GalaxyBots.ai</strong>
                <span className="text-sm text-muted-foreground">Comprehensive virtual boardroom & AI executive layer.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#D4A853] mt-2" />
              <div>
                <strong className="block text-[#E8EAF0]">BingoLingo.ai</strong>
                <span className="text-sm text-muted-foreground">AEO engine & brand presence intelligence.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400 mt-2" />
              <div>
                <strong className="block text-[#E8EAF0]">Prospector (PirateMonster)</strong>
                <span className="text-sm text-muted-foreground">Autonomous B2B intelligence & enrichment engine.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-400 mt-2" />
              <div>
                <strong className="block text-[#E8EAF0]">Mobile Ecosystem</strong>
                <span className="text-sm text-muted-foreground">Universal command & governance center on-the-go.</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
