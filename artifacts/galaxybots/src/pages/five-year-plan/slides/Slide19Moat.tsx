import React from 'react';

export default function Slide19Moat() {
  const moats = [
    {
      title: 'Data Flywheel',
      desc: 'Prospector accumulates proprietary B2B enrichment data that improves with scale—a moat that widens every day.'
    },
    {
      title: 'Institutional Memory',
      desc: 'Each client instance accumulates 36+ months of specific context, making switching costs compound quarterly.'
    },
    {
      title: 'Distribution Network',
      desc: '700+ agency partners by Year 5 creates a locked channel that would take competitors years to replicate.'
    },
    {
      title: 'AEO Category Ownership',
      desc: 'By defining the "Cloud 9 Score", BingoLingo becomes the reference product for AI presence—the Bloomberg of AEO.'
    }
  ];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Competitive Moat & Defensibility
      </h2>
      <div className="grid grid-cols-2 gap-8 flex-1">
        {moats.map((m, i) => (
          <div key={i} className="p-8 bg-white/5 border border-border/20 rounded-2xl flex flex-col justify-center space-y-4 hover:border-[#3D7FE8]/40 transition-all group">
            <h3 className="text-xl font-bold text-[#E8EAF0] group-hover:text-[#3D7FE8] transition-colors">{m.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {m.desc}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-8 p-6 bg-[#D4A853]/5 border border-[#D4A853]/20 rounded-2xl">
        <p className="text-sm text-center italic">
          <span className="text-[#D4A853] uppercase font-tech tracking-widest mr-2 font-bold">Defensibility:</span>
          "OpenAI builds the engine. We build the car, the dealership network, and the exclusive fuel supply."
        </p>
      </div>
    </div>
  );
}
