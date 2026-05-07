import React from 'react';

export default function Slide17Year1Priorities() {
  const priorities = [
    { title: 'Agency Expansion', text: 'Close first 10 flagship white-label partners.' },
    { title: 'Prospector Launch', text: 'Deploy fully autonomous pipeline (Phases 1-4).' },
    { title: 'NRR Benchmark', text: 'Achieve 90-day Net Revenue Retention > 110%.' },
    { title: 'Proof of Value', text: 'Publish 3 AEO case studies proving Cloud 9 ROI.' },
    { title: 'Mobile Presence', text: 'Universal Command Center v1 live on App Stores.' },
  ];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Year 1 Priorities <span className="text-muted-foreground text-xl lowercase ml-4">2026 Focus</span>
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-4">
          {priorities.map((p, i) => (
            <div key={i} className="flex gap-4 items-start p-4 bg-white/5 border border-border/10 rounded-xl hover:bg-white/10 transition-colors group">
              <div className="w-8 h-8 rounded bg-[#3D7FE8]/20 flex items-center justify-center shrink-0 font-tech font-bold text-[#3D7FE8] group-hover:bg-[#3D7FE8] group-hover:text-white transition-colors">
                {i + 1}
              </div>
              <div>
                <strong className="block text-sm uppercase tracking-widest mb-1">{p.title}</strong>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-center">
          <div className="p-8 bg-gradient-to-br from-[#0C0E26] to-[#08091A] border border-[#D4A853]/20 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <div className="w-24 h-24 border-8 border-[#D4A853] rounded-full" />
            </div>
            <h3 className="text-2xl font-display font-bold mb-4">North Star</h3>
            <p className="text-xl italic leading-relaxed text-[#E8EAF0]">
              "Transition from a tools company to an <span className="text-[#D4A853]">Infrastructure-as-an-Executive</span> provider for the SME mid-market."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
