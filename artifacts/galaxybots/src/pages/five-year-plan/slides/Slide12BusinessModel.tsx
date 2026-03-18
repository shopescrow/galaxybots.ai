import React from 'react';

export default function Slide12BusinessModel() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Business Model & Pricing
      </h2>
      <div className="grid grid-cols-2 gap-12 flex-1">
        <div className="space-y-6">
          <h3 className="font-tech text-[#3D7FE8] uppercase tracking-widest mb-4">Tiered Subscriptions</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-border/20">
              <span className="font-bold">Starter</span>
              <span className="text-[#D4A853] font-tech">$999/mo</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border-2 border-[#3D7FE8]">
              <div className="flex flex-col">
                <span className="font-bold">Pro</span>
                <span className="text-[10px] text-[#3D7FE8] uppercase tracking-widest">Most Popular</span>
              </div>
              <span className="text-[#D4A853] font-tech">$4,999/mo</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-border/20">
              <span className="font-bold">Scale</span>
              <span className="text-[#D4A853] font-tech">$9,999/mo</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-4">
            *All plans billed annually. Custom enterprise quotes for 100+ bot fleets.
          </p>
        </div>
        <div className="space-y-8">
          <div className="bg-white/5 p-8 rounded-2xl border border-border/20">
            <h3 className="font-tech text-[#D4A853] uppercase tracking-widest mb-6">Revenue Streams</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex justify-between pb-2 border-b border-white/10">
                <span>Core SaaS Subscriptions</span>
                <span className="text-[#E8EAF0] font-bold">Base Revenue</span>
              </li>
              <li className="flex justify-between pb-2 border-b border-white/10">
                <span>Credit Overages ($0.025/credit)</span>
                <span className="text-[#E8EAF0] font-bold">Usage Upside</span>
              </li>
              <li className="flex justify-between pb-2 border-b border-white/10">
                <span>White-Label Wholesale</span>
                <span className="text-[#E8EAF0] font-bold">High Velocity</span>
              </li>
              <li className="flex justify-between pb-2 border-b border-white/10">
                <span>Custom Bot Fabrication</span>
                <span className="text-[#E8EAF0] font-bold">Premium Add-on</span>
              </li>
            </ul>
          </div>
          <div className="bg-[#3D7FE8]/10 p-4 rounded-xl text-center border border-[#3D7FE8]/20">
            <span className="block text-sm font-bold uppercase tracking-widest mb-1">Target ACV</span>
            <span className="text-3xl font-display font-bold text-[#E8EAF0]">$36,000</span>
            <span className="block text-xs text-muted-foreground">Blended annual contract value</span>
          </div>
        </div>
      </div>
    </div>
  );
}
