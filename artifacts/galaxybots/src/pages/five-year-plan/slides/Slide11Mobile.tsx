import React from 'react';

export default function Slide11Mobile() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        GalaxyBots Mobile
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1 items-center">
        <div className="relative aspect-[9/16] w-64 bg-slate-900 rounded-[3rem] border-[8px] border-slate-800 mx-auto shadow-2xl p-4 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-800 rounded-b-2xl z-20" />
          <div className="h-full bg-[#08091A] rounded-[2rem] flex flex-col p-4">
            <div className="flex justify-between items-center mb-6 pt-4">
              <div className="w-8 h-8 rounded-lg bg-white/10" />
              <div className="w-4 h-4 rounded-full bg-cyan-400 animate-pulse" />
            </div>
            <div className="space-y-4">
              <div className="h-20 bg-white/5 rounded-xl p-3">
                <div className="w-1/2 h-2 bg-white/20 rounded mb-2" />
                <div className="w-3/4 h-4 bg-[#3D7FE8]/40 rounded" />
              </div>
              <div className="h-20 bg-white/5 rounded-xl p-3">
                <div className="w-1/2 h-2 bg-white/20 rounded mb-2" />
                <div className="w-3/4 h-4 bg-[#D4A853]/40 rounded" />
              </div>
              <div className="mt-auto pt-8">
                <div className="w-full h-10 bg-[#3D7FE8] rounded-xl flex items-center justify-center font-bold text-xs uppercase">Approve Strategy</div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-8">
          <div>
            <h3 className="text-2xl font-bold mb-4">Command in Your Pocket</h3>
            <p className="text-muted-foreground leading-relaxed">
              The Command Center on-the-go. Real-time governance approvals and fleet health monitoring via Expo React Native.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-sm font-bold uppercase tracking-widest">Push-Token Governance</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-sm font-bold uppercase tracking-widest">Real-time ROI Reports</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-sm font-bold uppercase tracking-widest">Universal Bot Directives</span>
            </div>
          </div>
          <div className="pt-4 flex gap-4">
             <div className="px-4 py-2 border border-border/40 rounded-lg text-xs font-tech text-muted-foreground">iOS READY</div>
             <div className="px-4 py-2 border border-border/40 rounded-lg text-xs font-tech text-muted-foreground">ANDROID READY</div>
          </div>
        </div>
      </div>
    </div>
  );
}
