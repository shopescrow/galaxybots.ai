import React from 'react';

export default function Slide04Vision() {
  return (
    <div className="flex flex-col h-full items-center justify-center text-center">
      <h2 className="text-4xl font-display font-bold mb-12 uppercase tracking-widest">
        The Vision
      </h2>
      <div className="max-w-4xl space-y-12">
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-[#3D7FE8]/20 to-[#D4A853]/20 blur-3xl opacity-50" />
          <p className="relative text-4xl sm:text-5xl font-bold leading-tight">
            Defining a new category:<br/>
            <span className="text-gradient font-display">The AI Executive Layer</span>
          </p>
        </div>
        
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          We aren't building "chatbots." We are building an autonomous corporate infrastructure that allows a single founder to command a global conglomerate from their pocket.
        </p>

        <div className="grid grid-cols-3 gap-8 pt-12">
          <div className="space-y-2">
            <div className="text-[#3D7FE8] text-3xl font-bold font-tech">01</div>
            <div className="text-sm font-bold uppercase tracking-widest">Autonomous</div>
            <div className="text-xs text-muted-foreground">They work while you sleep</div>
          </div>
          <div className="space-y-2">
            <div className="text-[#D4A853] text-3xl font-bold font-tech">02</div>
            <div className="text-sm font-bold uppercase tracking-widest">Interconnected</div>
            <div className="text-xs text-muted-foreground">They collaborate in boardrooms</div>
          </div>
          <div className="space-y-2">
            <div className="text-cyan-400 text-3xl font-bold font-tech">03</div>
            <div className="text-sm font-bold uppercase tracking-widest">Persistent</div>
            <div className="text-xs text-muted-foreground">They remember every decision</div>
          </div>
        </div>
      </div>
    </div>
  );
}
