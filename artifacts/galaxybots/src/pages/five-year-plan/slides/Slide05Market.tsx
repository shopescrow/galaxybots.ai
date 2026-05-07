import React from 'react';

export default function Slide05Market() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Market Opportunity
      </h2>
      <div className="grid grid-cols-2 gap-12">
        <div className="space-y-8">
          <div className="bg-white/5 p-6 rounded-2xl border border-border/20">
            <h3 className="font-tech text-xs uppercase tracking-[0.2em] text-[#3D7FE8] mb-4">Market Size (2030)</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="font-bold">TAM: $500B</span>
                  <span className="text-xs text-muted-foreground">Global AI SaaS Market</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#3D7FE8]" style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="font-bold">SAM: $150B</span>
                  <span className="text-xs text-muted-foreground">32M SMEs + 500k Agencies</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#D4A853]" style={{ width: '30%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="font-bold">SOM: $150M</span>
                  <span className="text-xs text-muted-foreground">Beachhead: 50k US Growth-stage Cos</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400" style={{ width: '5%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="font-tech text-[#D4A853] uppercase tracking-widest mb-4">Bottom-Up Methodology</h3>
          <p className="text-muted-foreground leading-relaxed">
            Our SOM is based on a conservative $3,000 ACV (Annual Contract Value) across 50,000 U.S. growth-stage companies.
          </p>
          <div className="p-6 bg-white/5 rounded-2xl border border-border/20">
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="text-cyan-400">•</span>
                <span>LinkedIn + US Census cross-referencing</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400">•</span>
                <span>AI SaaS adoption curve modeling (2024-2030)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-400">•</span>
                <span>Wholesale partner channel leverage (10x reach multiplier)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
