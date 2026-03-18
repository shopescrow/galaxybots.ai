import React from 'react';

export default function Slide13UnitEconomics() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Unit Economics
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-8">
          <div className="p-8 bg-white/5 rounded-2xl border border-border/20">
            <h3 className="font-tech text-[#3D7FE8] uppercase tracking-widest mb-6">Key Efficiency Metrics</h3>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Gross Margin</span>
                <span className="block text-4xl font-bold">82%</span>
                <span className="text-[10px] text-muted-foreground italic">Target by Year 2</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">LTV:CAC</span>
                <span className="block text-4xl font-bold">8:1</span>
                <span className="text-[10px] text-muted-foreground italic">Target by Year 3</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Payback</span>
                <span className="block text-4xl font-bold">&lt;12mo</span>
                <span className="text-[10px] text-muted-foreground italic">Target by Year 2</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">NRR Target</span>
                <span className="block text-4xl font-bold">&gt;110%</span>
                <span className="text-[10px] text-muted-foreground italic">Via credit expansion</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="font-tech text-[#D4A853] uppercase tracking-widest mb-4">Strategic Cost Controls</h3>
          <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-xl border border-border/10">
              <strong className="block text-sm mb-1">Optimized Inference Routing</strong>
              <p className="text-xs text-muted-foreground">Dynamic model switching reduces token costs by 40% without sacrificing output quality.</p>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-border/10">
              <strong className="block text-sm mb-1">Partner Distribution Efficiency</strong>
              <p className="text-xs text-muted-foreground">Wholesale channel reduces direct sales cost to near zero for partner-originated clients.</p>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-border/10">
              <strong className="block text-sm mb-1">Prospector Data Efficiency</strong>
              <p className="text-xs text-muted-foreground">Autonomous enrichment cost per lead drops as extraction library matures.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
