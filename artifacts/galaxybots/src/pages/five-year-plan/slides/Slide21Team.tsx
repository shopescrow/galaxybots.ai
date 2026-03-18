import React from 'react';

export default function Slide21Team() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Team & Culture
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1 items-center">
        <div className="space-y-8">
          <div>
            <h3 className="font-tech text-[#3D7FE8] uppercase tracking-widest mb-4">Leadership Philosophy</h3>
            <p className="text-2xl font-bold italic text-[#E8EAF0]">
              "Commanders, not managers."
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We are an AI-native organization. Every human team member is expected to manage a fleet of at least 10 autonomous agents within their first 90 days.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 rounded-xl border border-border/20">
              <span className="block text-xs font-tech text-muted-foreground uppercase mb-1">Current Headcount</span>
              <span className="text-2xl font-bold">12 Humans</span>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-border/20">
              <span className="block text-xs font-tech text-muted-foreground uppercase mb-1">Bot-to-Human Ratio</span>
              <span className="text-2xl font-bold">51:1</span>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="font-tech text-[#D4A853] uppercase tracking-widest mb-4">Key Hires: Year 1</h3>
          <ul className="space-y-4">
             <li className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-border/10">
               <div className="w-2 h-2 rounded-full bg-[#D4A853]" />
               <span className="text-sm font-bold uppercase tracking-widest">Head of Partner Success</span>
             </li>
             <li className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-border/10">
               <div className="w-2 h-2 rounded-full bg-[#3D7FE8]" />
               <span className="text-sm font-bold uppercase tracking-widest">Head of Growth (BingoLingo)</span>
             </li>
             <li className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-border/10">
               <div className="w-2 h-2 rounded-full bg-cyan-400" />
               <span className="text-sm font-bold uppercase tracking-widest">Senior ML/AI Engineer (Prospector)</span>
             </li>
          </ul>
          <div className="mt-8 pt-8 border-t border-white/10 text-center">
            <p className="font-tech text-[10px] text-muted-foreground uppercase tracking-[0.3em]">
              Autonomy • Proof-of-Value • Intelligence for Everyone
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
