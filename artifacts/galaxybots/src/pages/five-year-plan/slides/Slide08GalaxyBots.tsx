import React from 'react';

export default function Slide08GalaxyBots() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        GalaxyBots<span className="text-[#3D7FE8]">.ai</span>
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-6">
          <p className="text-xl text-muted-foreground leading-relaxed">
            The central nervous system for autonomous business management. A multi-tenant SaaS platform that hosts your entire executive suite.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#E8EAF0]">51 AI Directors</div>
              <div className="text-xs text-muted-foreground">From CMO to CISO, fully specialized.</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#E8EAF0]">Virtual Boardroom</div>
              <div className="text-xs text-muted-foreground">Secure multi-agent strategy discussions.</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#E8EAF0]">Memory Layer</div>
              <div className="text-xs text-muted-foreground">Cross-bot persistent company context.</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#E8EAF0]">Approval Hub</div>
              <div className="text-xs text-muted-foreground">Human-in-the-loop governance & ROI.</div>
            </div>
          </div>
        </div>
        <div className="bg-white/5 border border-border/20 rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 font-tech text-[10px] text-muted-foreground uppercase tracking-widest opacity-40">Architectural Core</div>
          <div className="h-full flex flex-col justify-center space-y-6">
            <div className="bg-white/10 p-4 rounded-xl border border-white/10">
              <div className="text-xs font-tech text-[#3D7FE8] mb-1">Key Differentiator</div>
              <div className="text-lg font-bold italic">"They don't just answer; they collaborate."</div>
            </div>
            <p className="text-sm text-muted-foreground">
              Unlike generic LLM wrappers, GalaxyBots characters have unique personas, memory of past boardroom sessions, and the ability to trigger external tools (Prospector, BingoLingo) autonomously.
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-[#3D7FE8]/20 text-[#3D7FE8] text-[10px] font-bold rounded-full border border-[#3D7FE8]/30">WHITE-LABEL READY</span>
              <span className="px-3 py-1 bg-[#D4A853]/20 text-[#D4A853] text-[10px] font-bold rounded-full border border-[#D4A853]/30">ROI-DRIVEN</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
