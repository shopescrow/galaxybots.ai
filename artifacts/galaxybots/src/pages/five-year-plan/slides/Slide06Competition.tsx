import React from 'react';

export default function Slide06Competition() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Competitive Landscape
      </h2>
      <div className="relative flex-1 bg-white/5 border border-border/20 rounded-2xl p-12">
        {/* X and Y Axis Labels */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 font-tech text-xs uppercase tracking-widest text-muted-foreground">High Autonomy</div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-tech text-xs uppercase tracking-widest text-muted-foreground">Low Autonomy</div>
        <div className="absolute left-4 top-1/2 -translate-y-1/2 -rotate-90 font-tech text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Low Specialization</div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 font-tech text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">High Specialization</div>

        {/* Grid lines */}
        <div className="absolute inset-16 border-l border-b border-border/40 flex items-center justify-center">
          <div className="w-full h-px bg-border/40" />
          <div className="absolute inset-0 h-full w-px bg-border/40 left-1/2" />
        </div>

        {/* Competitors */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-xs text-muted-foreground font-bold">Generic Chatbots</div>
          <div className="text-[10px] text-muted-foreground/60">ChatGPT, Claude</div>
        </div>
        <div className="absolute bottom-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-xs text-muted-foreground font-bold">Productivity Co-pilots</div>
          <div className="text-[10px] text-muted-foreground/60">Microsoft 365, Notion</div>
        </div>
        <div className="absolute bottom-1/4 right-1/4 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-xs text-muted-foreground font-bold">CRM-Specific AI</div>
          <div className="text-[10px] text-muted-foreground/60">Salesforce Einstein</div>
        </div>

        {/* GalaxyBots Position */}
        <div className="absolute top-1/4 right-1/4 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="bg-[#D4A853] text-[#08091A] px-4 py-2 rounded-lg font-bold shadow-[0_0_20px_rgba(212,168,83,0.5)] transform scale-125">
            GalaxyBots.ai
          </div>
          <div className="mt-4 text-[10px] text-[#D4A853] font-tech uppercase tracking-widest">Autonomous Fleet</div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-8">
        <div className="text-sm text-muted-foreground">
          <strong className="text-[#E8EAF0]">Our Wedge:</strong> White-label partner channel + proprietary AEO intelligence creates a distribution moat others can't easily replicate.
        </div>
        <div className="text-sm text-muted-foreground">
          <strong className="text-[#E8EAF0]">The Unoccupied Space:</strong> No one is providing high-specialization, high-autonomy executives for the SME sector.
        </div>
      </div>
    </div>
  );
}
