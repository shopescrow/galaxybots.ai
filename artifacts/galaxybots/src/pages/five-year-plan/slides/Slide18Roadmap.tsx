import React from 'react';

export default function Slide18Roadmap() {
  const years = ['2026', '2027', '2028', '2029', '2030'];
  const tracks = [
    { name: 'Platform', color: '#3D7FE8', milestones: ['WL Partner Portal', 'Governance v2', 'Enterprise Pack', 'Global SSO', 'IPO Readiness'] },
    { name: 'Content', color: '#D4A853', milestones: ['AEO Engine v1', 'Cloud 9 Score', 'Attribution Loop', 'BingoLingo API', 'Category Dominance'] },
    { name: 'Intelligence', color: 'rgb(34, 211, 238)', milestones: ['Prospector v1', 'Learning Agent', 'Standalone EXIT', 'Proprietary Dataset', 'AI Market Index'] },
    { name: 'Mobile', color: 'rgb(192, 132, 252)', milestones: ['Command Center', 'Fleet Health', 'Approval Engine', 'Native Agent', 'Universal Interface'] },
  ];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        5-Year Strategic Roadmap
      </h2>
      <div className="flex-1 relative">
        <div className="grid grid-cols-6 h-full">
          <div className="col-span-1" />
          {years.map(y => (
            <div key={y} className="col-span-1 border-l border-white/10 flex flex-col items-center pt-2">
              <span className="text-xs font-tech text-muted-foreground uppercase tracking-widest">{y}</span>
            </div>
          ))}
        </div>
        
        <div className="absolute inset-0 top-12 space-y-4">
          {tracks.map(t => (
            <div key={t.name} className="grid grid-cols-6 items-center group">
              <div className="col-span-1 pr-4 text-right">
                <span className="text-[10px] font-tech font-bold uppercase tracking-widest" style={{ color: t.color }}>{t.name}</span>
              </div>
              <div className="col-span-5 h-8 bg-white/5 rounded-lg flex items-center px-4 relative">
                {t.milestones.map((m, i) => (
                  <div 
                    key={m} 
                    className="absolute h-3 w-3 rounded-full border-2 border-[#08091A] shadow-lg flex items-center justify-center group/m"
                    style={{ left: `${(i * 20) + 10}%`, backgroundColor: t.color }}
                  >
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] opacity-0 group-hover:opacity-100 transition-opacity font-tech text-muted-foreground uppercase pointer-events-none">
                      {m}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.2em]">
          Q1 2026: Prospector Phase 1 • 2028: Healthcare + Legal Packs • 2030: Acquisition Ready
        </p>
      </div>
    </div>
  );
}
