import React from 'react';

export default function Slide10Prospector() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Prospector <span className="text-cyan-400 font-tech text-2xl uppercase tracking-tighter">(PirateMonster Engine)</span>
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-6">
          <p className="text-xl text-muted-foreground leading-relaxed">
            More than a feature—a standalone revenue product. An autonomous B2B intelligence engine that replaces manual lead generation.
          </p>
          <div className="p-6 bg-white/5 border border-border/20 rounded-2xl relative">
            <div className="absolute top-4 right-4 text-[10px] font-tech text-cyan-400 animate-pulse">AUTONOMOUS PIPELINE</div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-sm font-bold">Discover</span>
                <span className="text-[10px] text-muted-foreground italic">Multi-source identification</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-sm font-bold">Enrich</span>
                <span className="text-[10px] text-muted-foreground italic">6-step agentic extraction</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-sm font-bold">Validate</span>
                <span className="text-[10px] text-muted-foreground italic">Critic-reviewer loop</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-sm font-bold">ICP Score</span>
                <span className="text-[10px] text-muted-foreground italic">Strategic qualification</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-8">
          <div className="bg-white/5 p-6 rounded-2xl border border-border/20">
            <h3 className="font-tech text-[#D4A853] uppercase tracking-widest mb-4">The Data Flywheel</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The engine learns from every job. Novel extraction patterns are stored and reused, creating a compounding data moat.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-cyan-400/10 p-4 rounded-xl text-center">
                <span className="block text-2xl font-bold text-cyan-400">&lt;$0.50</span>
                <span className="text-[10px] font-tech uppercase">Cost per Lead</span>
              </div>
              <div className="bg-[#3D7FE8]/10 p-4 rounded-xl text-center">
                <span className="block text-2xl font-bold text-[#3D7FE8]">&gt;85%</span>
                <span className="text-[10px] font-tech uppercase">Accuracy Target</span>
              </div>
            </div>
          </div>
          <p className="text-xs italic text-muted-foreground">
            Comparable to Clay.com but built specifically for agentic orchestration and white-label distribution.
          </p>
        </div>
      </div>
    </div>
  );
}
