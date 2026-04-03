import React from "react";

export default function Slide20Roadmap() {
  const quarters = ["Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4"];
  const years = ["2026", "2026", "2026", "2026", "2027", "2027", "2027", "2027", "2028", "2028", "2028", "2028", "2029", "2029", "2029", "2029", "2030", "2030", "2030", "2030"];

  const tracks = [
    {
      name: "Platform",
      color: "#3b82f6",
      bg: "rgba(59,130,246,0.12)",
      border: "rgba(59,130,246,0.3)",
      items: [
        { q: 0, span: 1, text: "Prospector\nPhases 1–4" },
        { q: 1, span: 1, text: "White-label\npartner portal" },
        { q: 4, span: 2, text: "40 agency\npartners" },
        { q: 8, span: 1, text: "Intl beta\n(UK/Canada)" },
        { q: 11, span: 1, text: "600 direct\nclients" },
        { q: 15, span: 1, text: "300 partners\nmilestone" },
        { q: 16, span: 4, text: "$90M ARR\nSeries B ready" },
      ],
    },
    {
      name: "Content",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.3)",
      items: [
        { q: 1, span: 2, text: "BingoLingo\nAEO attribution" },
        { q: 5, span: 2, text: "Multilingual\ncontent gen" },
        { q: 9, span: 2, text: "Video &\npodcast types" },
        { q: 13, span: 2, text: "Real-time AEO\nmonitoring" },
        { q: 18, span: 2, text: "Content\nOS launch" },
      ],
    },
    {
      name: "Intelligence",
      color: "#60a5fa",
      bg: "rgba(96,165,250,0.10)",
      border: "rgba(96,165,250,0.3)",
      items: [
        { q: 0, span: 2, text: "Cloud 9\nScore v1" },
        { q: 6, span: 2, text: "Competitive\nAEO alerts" },
        { q: 10, span: 2, text: "Predictive\nAEO modeling" },
        { q: 14, span: 2, text: "Industry\nbenchmarks" },
        { q: 18, span: 2, text: "AEO\nmarketplace" },
      ],
    },
    {
      name: "Mobile",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.10)",
      border: "rgba(251,191,36,0.3)",
      items: [
        { q: 2, span: 2, text: "Mobile v1\npublic launch" },
        { q: 4, span: 2, text: "Governance\n2.0 + biometrics" },
        { q: 10, span: 2, text: "Offline mode\n+ native widgets" },
        { q: 14, span: 2, text: "Partner portal\nmobile" },
        { q: 18, span: 2, text: "Enterprise\nmobile MDM" },
      ],
    },
  ];

  const COL = 20;

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(59,130,246,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "3.5vh 4vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>5-Year Roadmap — 20-Quarter Swimlane</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1vh" }} />
          </div>
          <div style={{ display: "flex", gap: "2vw", alignItems: "center" }}>
            {tracks.map((t) => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: "0.5vw" }}>
                <div style={{ width: "0.8vw", height: "0.8vw", background: t.color, borderRadius: "50%" }} />
                <span style={{ fontSize: "1vw", color: "#94a3b8" }}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "7vw repeat(20, 1fr)", gap: "0.3vh 0.15vw", marginBottom: "0.5vh" }}>
            <div />
            {years.map((y, i) => {
              if (i === 0 || years[i] !== years[i - 1]) {
                return (
                  <div key={y + i} style={{ gridColumn: `span 4`, background: "rgba(59,130,246,0.1)", borderRadius: "4px", textAlign: "center", padding: "0.5vh 0" }}>
                    <div className="font-display" style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>{y}</div>
                  </div>
                );
              }
              return null;
            }).filter(Boolean)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "7vw repeat(20, 1fr)", gap: "0.3vh 0.15vw", marginBottom: "0.6vh" }}>
            <div />
            {quarters.map((q, i) => (
              <div key={i} style={{ textAlign: "center", padding: "0.3vh 0", fontSize: "0.85vw", color: "#4a5568", fontWeight: 600 }}>{q}</div>
            ))}
          </div>

          {tracks.map((track) => {
            const filled: (null | { text: string; color: string; bg: string; border: string; span: number })[] = Array(COL).fill(null);
            track.items.forEach((item) => {
              filled[item.q] = { text: item.text, color: track.color, bg: track.bg, border: track.border, span: item.span };
              for (let s = 1; s < item.span; s++) {
                if (item.q + s < COL) filled[item.q + s] = { text: "", color: track.color, bg: track.bg, border: track.border, span: 0 };
              }
            });

            return (
              <div key={track.name} style={{ display: "grid", gridTemplateColumns: "7vw repeat(20, 1fr)", gap: "0.3vh 0.15vw", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "0.8vw" }}>
                  <div style={{ fontSize: "1vw", fontWeight: 700, color: track.color }}>{track.name}</div>
                </div>
                {Array.from({ length: COL }, (_, i) => {
                  const cell = filled[i];
                  if (!cell) {
                    return <div key={i} style={{ background: "rgba(17,24,41,0.4)", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.04)" }} />;
                  }
                  if (cell.span === 0) return null;
                  return (
                    <div key={i} style={{ gridColumn: `span ${cell.span}`, background: cell.bg, border: `1px solid ${cell.border}`, borderRadius: "6px", padding: "1vh 0.6vw", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: "0.85vw", fontWeight: 600, color: cell.color, textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.3 }}>{cell.text}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "1.5vh", display: "flex", alignItems: "center", justifyContent: "center", gap: "2vw" }}>
          <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>Q1 2026</div>
          <div style={{ height: "0.2vh", flex: 1, background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
          <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>$90M ARR — Q4 2030</div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
