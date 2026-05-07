import React from 'react';

export default function Slide03Problem() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        The Problem
      </h2>
      <div className="grid grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="text-5xl font-bold text-[#D4A853]">
            $1M - $5M<span className="text-2xl text-muted-foreground block mt-2 tracking-normal font-sans">Annual executive payroll for SMEs</span>
          </div>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Small and medium enterprises (SMEs) are structurally disadvantaged. They lack the capital to hire a full C-suite, forcing owners to play every role—leading to burnout, strategic blind spots, and stagnation.
          </p>
        </div>
        <div className="bg-white/5 border border-border/20 p-8 rounded-2xl space-y-6">
          <h3 className="font-tech text-[#3D7FE8] uppercase tracking-widest mb-4">The Talent Gap</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <span className="text-sm">Cost of elite CMO</span>
              <span className="font-bold">$250k+</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <span className="text-sm">Cost of elite CFO</span>
              <span className="font-bold">$300k+</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <span className="text-sm">Cost of elite CISO</span>
              <span className="font-bold">$280k+</span>
            </div>
            <div className="pt-4 text-center">
              <span className="text-2xl font-display font-bold text-red-400">Inefficient. Expensive. Scarce.</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-auto pt-8 border-t border-border/20">
        <p className="text-center font-tech text-sm tracking-widest text-muted-foreground uppercase">
          The problem isn't AI capability—it's accessibility, orchestration, and trust.
        </p>
      </div>
    </div>
  );
}
