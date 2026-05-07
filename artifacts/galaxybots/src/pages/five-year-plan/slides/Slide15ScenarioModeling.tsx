import React from 'react';

export default function Slide15ScenarioModeling() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Scenario Modeling
      </h2>
      <div className="grid grid-cols-3 gap-6 flex-1">
        {/* Bear Case */}
        <div className="bg-white/5 border border-red-900/40 rounded-2xl p-6 flex flex-col">
          <div className="text-xs font-tech text-red-400 uppercase tracking-widest mb-2">Bear Case</div>
          <div className="text-4xl font-display font-bold mb-8">$42M<span className="text-xs block text-muted-foreground mt-1 tracking-normal font-sans uppercase">2030 ARR Target</span></div>
          <div className="space-y-4 flex-1">
            <div className="p-3 bg-red-400/5 rounded-lg border border-red-400/10">
              <span className="text-[10px] block text-red-400 font-tech uppercase mb-1">Risk Factors</span>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li>• Regulatory headwinds</li>
                <li>• Slow partner adoption</li>
                <li>• High LLM API inflation</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              Conservative growth based on direct sales dominance and higher churn.
            </p>
          </div>
        </div>

        {/* Base Case */}
        <div className="bg-white/5 border border-[#3D7FE8]/40 rounded-2xl p-6 flex flex-col scale-105 shadow-2xl relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#3D7FE8] text-[8px] font-bold px-3 py-1 rounded-full uppercase tracking-[0.2em]">Current Trajectory</div>
          <div className="text-xs font-tech text-[#3D7FE8] uppercase tracking-widest mb-2">Base Case</div>
          <div className="text-4xl font-display font-bold mb-8">$90M<span className="text-xs block text-muted-foreground mt-1 tracking-normal font-sans uppercase">2030 ARR Target</span></div>
          <div className="space-y-4 flex-1">
            <div className="p-3 bg-[#3D7FE8]/5 rounded-lg border border-[#3D7FE8]/10">
              <span className="text-[10px] block text-[#3D7FE8] font-tech uppercase mb-1">Key Drivers</span>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li>• Standard partner growth</li>
                <li>• Global SME adoption</li>
                <li>• NRR expansion &gt;110%</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              Achievable path based on current pilot data and partner pipeline.
            </p>
          </div>
        </div>

        {/* Bull Case */}
        <div className="bg-white/5 border border-emerald-900/40 rounded-2xl p-6 flex flex-col">
          <div className="text-xs font-tech text-emerald-400 uppercase tracking-widest mb-2">Bull Case</div>
          <div className="text-4xl font-display font-bold mb-8">$180M<span className="text-xs block text-muted-foreground mt-1 tracking-normal font-sans uppercase">2030 ARR Target</span></div>
          <div className="space-y-4 flex-1">
            <div className="p-3 bg-emerald-400/5 rounded-lg border border-emerald-400/10">
              <span className="text-[10px] block text-emerald-400 font-tech uppercase mb-1">Growth Accelerants</span>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li>• Partner channel breakout</li>
                <li>• Prospector standalone exit</li>
                <li>• Early Enterprise licensing</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              Aggressive capture of the AI infrastructure layer for mid-market.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.3em]">
          Variables: Partner Conversion Rate • Standalone Pricing Adoption • International Expansion Timing
        </p>
      </div>
    </div>
  );
}
