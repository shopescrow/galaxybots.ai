import React from 'react';

export default function Slide20Risks() {
  const risks = [
    { r: 'LLM API cost inflation', p: 'Medium', i: 'High', m: 'Multi-provider routing + pass-through credit pricing' },
    { r: 'Big Tech market entry', p: 'Medium', i: 'High', m: 'Focus on orchestration, memory, and agency distribution' },
    { r: 'Partner adoption lag', p: 'Medium', i: 'Medium', m: 'Front-load incentives + parallel direct sales motion' },
    { r: 'Regulatory tightening', p: 'Low-Med', i: 'Medium', m: 'KiloPro compliance layer + localized data residency' },
    { r: 'Prospector data plateau', p: 'Low', i: 'Medium', m: 'Learning Agent + human review queue continuous improvement' },
  ];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-4xl font-display font-bold mb-12 border-b border-border/40 pb-4">
        Risks & Mitigations
      </h2>
      <div className="flex-1 bg-white/5 border border-border/20 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full h-full">
          <thead className="bg-white/10 font-tech uppercase text-[10px] tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left">Strategic Risk</th>
              <th className="px-6 py-4 text-left">Probability</th>
              <th className="px-6 py-4 text-left">Impact</th>
              <th className="px-6 py-4 text-left">Mitigation Strategy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {risks.map((row, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-[#E8EAF0]">{row.r}</td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded border uppercase ${row.p.includes('High') ? 'text-orange-400 border-orange-400/30' : 'text-blue-400 border-blue-400/30'}`}>
                    {row.p}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded border uppercase ${row.i === 'High' ? 'text-red-400 border-red-400/30' : 'text-orange-400 border-orange-400/30'}`}>
                    {row.i}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-muted-foreground">{row.m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
