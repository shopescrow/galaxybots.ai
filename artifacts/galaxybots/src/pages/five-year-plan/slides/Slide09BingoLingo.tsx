import React from 'react';

export default function Slide09BingoLingo() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        BingoLingo<span className="text-[#D4A853]">.ai</span>
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="bg-white/5 border border-border/20 rounded-2xl p-8 flex flex-col justify-center text-center space-y-8">
          <div className="inline-block mx-auto px-6 py-2 bg-[#D4A853]/10 border border-[#D4A853]/30 rounded-xl">
            <span className="text-sm font-tech text-[#D4A853] tracking-[0.2em] uppercase block mb-1">Proprietary Metric</span>
            <span className="text-4xl font-display font-bold">Cloud 9 Score</span>
          </div>
          <p className="text-muted-foreground">
            The industry's first standardized measurement of a brand's presence across AI answer engines (ChatGPT, Perplexity, Claude, Gemini).
          </p>
        </div>
        <div className="space-y-6">
          <h3 className="font-tech text-[#3D7FE8] uppercase tracking-widest mb-4">AEO Intelligence Engine</h3>
          <ul className="space-y-6">
            <li className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-[#D4A853] font-bold font-tech">01</div>
              <div>
                <strong className="block mb-1">Answer Engine Optimization</strong>
                <span className="text-sm text-muted-foreground">Scanning and scoring how LLMs perceive and recommend your brand.</span>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-[#D4A853] font-bold font-tech">02</div>
              <div>
                <strong className="block mb-1">Content Attribution Loop</strong>
                <span className="text-sm text-muted-foreground">Identifying which content directly influences AI recommendations.</span>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-[#D4A853] font-bold font-tech">03</div>
              <div>
                <strong className="block mb-1">Strategic Flywheel</strong>
                <span className="text-sm text-muted-foreground">Feeds high-intent data back to the CMO Bot and the Prospector engine.</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
