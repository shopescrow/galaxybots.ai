import React from 'react';

export default function Slide07Infrastructure() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        AI Infrastructure: Build vs. Buy
      </h2>
      <div className="grid grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="bg-white/5 border-l-4 border-[#3D7FE8] p-8 rounded-r-2xl">
            <h3 className="text-2xl font-bold mb-4 italic">"We are LLM-agnostic buyers, not foundation model trainers."</h3>
            <p className="text-muted-foreground leading-relaxed">
              We leverage the best-in-class models (Claude 3.5, GPT-4o) and route them by task type. This ensures maximum resilience, lower capex, and faster iteration.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-xl border border-border/20 text-center">
              <span className="block text-sm font-tech text-[#D4A853] uppercase mb-1">Lower Capex</span>
              <span className="text-xs text-muted-foreground">No GPU farm required</span>
            </div>
            <div className="bg-white/5 p-4 rounded-xl border border-border/20 text-center">
              <span className="block text-sm font-tech text-[#D4A853] uppercase mb-1">Model Resilience</span>
              <span className="text-xs text-muted-foreground">Agnostic to provider failures</span>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="font-tech text-[#D4A853] uppercase tracking-widest mb-4">Our Proprietary Value Layer</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-border/10">
              <div className="w-10 h-10 rounded-full bg-[#3D7FE8]/20 flex items-center justify-center shrink-0">
                <span className="text-[#3D7FE8] font-bold">01</span>
              </div>
              <div>
                <strong className="block mb-1">Agentic Orchestration</strong>
                <span className="text-sm text-muted-foreground">Multi-agent LangGraph workflows that reason and adapt.</span>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-border/10">
              <div className="w-10 h-10 rounded-full bg-[#D4A853]/20 flex items-center justify-center shrink-0">
                <span className="text-[#D4A853] font-bold">02</span>
              </div>
              <div>
                <strong className="block mb-1">Institutional Memory</strong>
                <span className="text-sm text-muted-foreground">Long-term context accumulation for company-specific intelligence.</span>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl border border-border/10">
              <div className="w-10 h-10 rounded-full bg-cyan-400/20 flex items-center justify-center shrink-0">
                <span className="text-cyan-400 font-bold">03</span>
              </div>
              <div>
                <strong className="block mb-1">Enrichment Data Flywheel</strong>
                <span className="text-sm text-muted-foreground">The Prospector's proprietary extraction patterns and dataset.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
