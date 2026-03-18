import React from 'react';

export default function Slide22ExitAsk() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Exit Scenarios & The Ask
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-6">
          <h3 className="font-tech text-[#3D7FE8] uppercase tracking-widest mb-4">Path to Liquidity (Year 5)</h3>
          <div className="space-y-4">
            <div className="p-4 bg-white/5 border border-border/20 rounded-xl">
              <strong className="block text-sm mb-1 uppercase tracking-widest">Strategic Acquisition</strong>
              <p className="text-xs text-muted-foreground">Target: Salesforce, HubSpot, ServiceNow, SAP. $500M-$2B range at 8-12x ARR for high-growth AI SaaS.</p>
            </div>
            <div className="p-4 bg-white/5 border border-border/20 rounded-xl">
              <strong className="block text-sm mb-1 uppercase tracking-widest">Series B / IPO</strong>
              <div className="text-xs text-muted-foreground">$90M ARR with 82% gross margin creates a compelling public market story in the AI layer.</div>
            </div>
            <div className="p-4 bg-white/5 border border-border/20 rounded-xl">
              <strong className="block text-sm mb-1 uppercase tracking-widest">Profitable Independence</strong>
              <p className="text-xs text-muted-foreground">Partner channel cash flow enables self-sustaining growth and management buyout options.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center space-y-12">
          <div className="text-center">
            <h3 className="font-tech text-xs text-muted-foreground uppercase tracking-[0.3em] mb-4">Current Traction</h3>
            <div className="flex justify-center gap-8">
              <div>
                <span className="block text-3xl font-bold">$125K</span>
                <span className="text-[10px] font-tech text-muted-foreground uppercase">Current MRR</span>
              </div>
              <div>
                <span className="block text-3xl font-bold">14</span>
                <span className="text-[10px] font-tech text-muted-foreground uppercase">Pilot Partners</span>
              </div>
            </div>
          </div>
          
          <div className="p-8 bg-gradient-to-br from-[#3D7FE8]/20 to-[#D4A853]/20 border border-white/20 rounded-2xl text-center shadow-2xl">
            <h3 className="font-display text-2xl font-bold mb-4 uppercase tracking-widest">The Ask</h3>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              We are seeking strategic partners and growth capital to accelerate the Prospector expansion and secure the global agency distribution layer.
            </p>
            <div className="font-tech text-sm text-[#E8EAF0] tracking-widest font-bold">
              CONTACT@GALAXYBOTS.AI
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
