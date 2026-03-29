export default function Slide21Closing() {
  const directors = [
    { name: "Chairman Atlas", dept: "Board" },
    { name: "Magnus Drake", dept: "Executive" },
    { name: "CFO Sentinel Marcus", dept: "Finance" },
    { name: "FP&A Oracle Demi", dept: "Finance" },
    { name: "Product Oracle Sasha", dept: "Product" },
    { name: "Brand Maven Priya", dept: "Marketing" },
    { name: "Growth Hawk Yusuf", dept: "Biz Dev" },
    { name: "Closer King Rivera", dept: "Sales" },
    { name: "Tech Visionary Zara", dept: "Technology" },
    { name: "General Counsel Alexis", dept: "Legal" },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1530 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(59,130,246,0.1) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ marginBottom: "2.5vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>The Closing Vision</span>
          <div className="gold-rule" style={{ width: "5vw", marginTop: "1.2vh" }} />
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "45%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div className="quote-panel" style={{ borderRadius: "8px", marginBottom: "2vh" }}>
              <div style={{ fontSize: "1.35vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "In five years, the question will not be 'can a company afford AI executives?' It will be 'how did companies ever operate without them?' We are building the answer."
              </div>
              <div style={{ marginTop: "1.5vh", fontSize: "1.15vw", color: "#f59e0b", fontWeight: 600 }}>— Magnus Drake, Managing Director</div>
            </div>

            <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(245,158,11,0.08))", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.35vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "The board has reviewed, challenged, and endorsed every element of this plan. We do not present this as a roadmap. We present it as a commitment."
              </div>
              <div style={{ marginTop: "1.5vh", fontSize: "1.15vw", color: "#f59e0b", fontWeight: 600 }}>— Chairman Atlas, Chairperson</div>
            </div>
          </div>

          <div style={{ width: "55%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#94a3b8", marginBottom: "1.5vh", letterSpacing: "0.05em", textTransform: "uppercase" }}>The Team Behind This Plan</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2vh" }}>
              {directors.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "1vw", background: "rgba(17,24,41,0.8)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "6px", padding: "1.2vh 1.2vw" }}>
                  <div style={{ width: "2.5vw", height: "2.5vw", background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(245,158,11,0.2))", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "1vw", fontWeight: 700, color: "#f0f4ff" }}>{d.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "1.05vw", fontWeight: 600, color: "#f0f4ff", lineHeight: 1.2 }}>{d.name}</div>
                    <div style={{ fontSize: "0.95vw", color: "#4a5568" }}>{d.dept}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
