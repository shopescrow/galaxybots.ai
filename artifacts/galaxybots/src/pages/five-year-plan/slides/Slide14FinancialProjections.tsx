import React from 'react';

export default function Slide14FinancialProjections() {
  const data = [
    { year: '2026', arr: '$1.2M', clients: '80', partners: '12', description: 'Beachhead validation' },
    { year: '2027', arr: '$4.8M', clients: '250', partners: '40', description: 'Scale & partner maturity' },
    { year: '2028', arr: '$14.0M', clients: '600', partners: '120', description: 'Market leader position' },
    { year: '2029', arr: '$38.0M', clients: '1,400', partners: '300', description: 'International expansion' },
    { year: '2030', arr: '$90.0M', clients: '3,000', partners: '700', description: 'IPO / Acquisition readiness' },
  ];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Financial Projections: <span className="text-[#3D7FE8]">Base Case</span>
      </h2>
      <div className="flex-1">
        <div className="bg-white/5 border border-border/20 rounded-2xl overflow-hidden shadow-2xl">
          <table className="w-full">
            <thead className="bg-white/10 font-tech uppercase text-[10px] tracking-widest">
              <tr>
                <th className="px-8 py-4 text-left">Year</th>
                <th className="px-8 py-4 text-left">ARR Milestone</th>
                <th className="px-8 py-4 text-left">Direct Clients</th>
                <th className="px-8 py-4 text-left">Agency Partners</th>
                <th className="px-8 py-4 text-left hidden sm:table-cell">Focus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-8 py-6 font-bold">{row.year}</td>
                  <td className="px-8 py-6 text-2xl font-display text-[#D4A853]">{row.arr}</td>
                  <td className="px-8 py-6 text-muted-foreground">{row.clients}</td>
                  <td className="px-8 py-6 text-muted-foreground">{row.partners}</td>
                  <td className="px-8 py-6 text-xs text-muted-foreground italic hidden sm:table-cell">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-8 p-6 bg-[#3D7FE8]/5 border border-[#3D7FE8]/20 rounded-2xl">
        <p className="text-sm text-muted-foreground italic">
          <strong className="text-[#3D7FE8] uppercase font-tech tracking-widest mr-2">Key Assumption:</strong> 
          Partner channel drives 50% of all new ARR from Year 3 onward as the white-label ecosystem matures globally.
        </p>
      </div>
    </div>
  );
}
