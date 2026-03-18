import React from 'react';

export default function Slide16GTMStrategy() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Go-to-Market Strategy
      </h2>
      <div className="grid grid-cols-3 gap-8 flex-1">
        <div className="p-6 bg-white/5 border border-border/20 rounded-2xl space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#D4A853]/10 flex items-center justify-center border border-[#D4A853]/30 mb-4">
            <span className="font-tech text-[#D4A853] font-bold">01</span>
          </div>
          <h3 className="font-bold uppercase tracking-widest text-sm text-[#E8EAF0]">Content-Led</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            BingoLingo self-demonstrates value. AEO reports generate massive inbound interest for the full GalaxyBots suite.
          </p>
        </div>
        <div className="p-6 bg-white/5 border border-border/20 rounded-2xl space-y-4 shadow-xl scale-105 border-[#3D7FE8]/30">
          <div className="w-12 h-12 rounded-xl bg-[#3D7FE8]/10 flex items-center justify-center border border-[#3D7FE8]/30 mb-4">
            <span className="font-tech text-[#3D7FE8] font-bold">02</span>
          </div>
          <h3 className="font-bold uppercase tracking-widest text-sm text-[#E8EAF0]">Partner-Led</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            White-label agencies as primary distribution. Zero marginal CAC per client they onboard through their own trust networks.
          </p>
        </div>
        <div className="p-6 bg-white/5 border border-border/20 rounded-2xl space-y-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-400/10 flex items-center justify-center border border-cyan-400/30 mb-4">
            <span className="font-tech text-cyan-400 font-bold">03</span>
          </div>
          <h3 className="font-bold uppercase tracking-widest text-sm text-[#E8EAF0]">Community-Led</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            GalaxyBots Commander community—peer referrals from successful operators creating a viral advocacy loop.
          </p>
        </div>
      </div>
      <div className="mt-12 bg-white/5 border border-border/20 rounded-2xl p-8">
        <h3 className="text-center font-tech text-[10px] text-muted-foreground uppercase tracking-[0.4em] mb-8">The Partner Flywheel</h3>
        <div className="flex items-center justify-between max-w-3xl mx-auto relative">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -z-10" />
          <div className="bg-[#0C0E26] border border-border/40 px-4 py-3 rounded-lg text-[10px] font-tech text-center">
            PARTNER SIGNS
          </div>
          <div className="text-muted-foreground">→</div>
          <div className="bg-[#0C0E26] border border-border/40 px-4 py-3 rounded-lg text-[10px] font-tech text-center">
            DEPLOYS TO CLIENTS
          </div>
          <div className="text-muted-foreground">→</div>
          <div className="bg-[#0C0E26] border border-border/40 px-4 py-3 rounded-lg text-[10px] font-tech text-center">
            CLIENTS SEE ROI
          </div>
          <div className="text-muted-foreground">→</div>
          <div className="bg-[#0C0E26] border border-[#3D7FE8] px-4 py-3 rounded-lg text-[10px] font-tech text-center text-[#3D7FE8] shadow-[0_0_15px_rgba(61,127,232,0.3)]">
            PARTNER UPGRADES
          </div>
        </div>
      </div>
    </div>
  );
}
