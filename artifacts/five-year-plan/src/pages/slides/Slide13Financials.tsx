export default function Slide13Financials() {
  const rows = [
    { year: "2026", arr: "$1.2M", clients: "80", partners: "12", milestone: "PMF validation, Prospector Phases 1–2 live" },
    { year: "2027", arr: "$4.8M", clients: "250", partners: "40", milestone: "White-label at scale, BingoLingo AEO loop mature" },
    { year: "2028", arr: "$14M", clients: "600", partners: "120", milestone: "Mobile monetization, Prospector fully autonomous" },
    { year: "2029", arr: "$38M", clients: "1,400", partners: "300", milestone: "International expansion (UK, Canada, Australia)" },
    { year: "2030", arr: "$90M", clients: "3,000", partners: "700", milestone: "Series B / strategic exit readiness, enterprise licensing" },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 60% at 70% 30%, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>5-Year Financial Projections</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
          </div>
          <div style={{ display: "flex", gap: "1vw" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>Chairman Atlas</div>
            </div>
            <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>CFO Sentinel Marcus</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(59,130,246,0.2)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 0.8fr 0.8fr 2fr", background: "rgba(59,130,246,0.12)", padding: "1.2vh 1.5vw", borderBottom: "1px solid rgba(59,130,246,0.2)" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>Year</div>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>ARR</div>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>Clients</div>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>Partners</div>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>Key Milestone</div>
              </div>
              {rows.map((row, i) => (
                <div key={row.year} style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 0.8fr 0.8fr 2fr", padding: "1.5vh 1.5vw", borderBottom: i < rows.length - 1 ? "1px solid rgba(30,40,70,0.8)" : "none", background: i === rows.length - 1 ? "rgba(59,130,246,0.06)" : "rgba(17,24,41,0.8)", alignItems: "center" }}>
                  <div style={{ fontSize: "1.15vw", fontWeight: 700, color: "#f0f4ff" }}>{row.year}</div>
                  <div className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: i === rows.length - 1 ? "#f59e0b" : "#3b82f6" }}>{row.arr}</div>
                  <div style={{ fontSize: "1.15vw", fontWeight: 600, color: "#f0f4ff" }}>{row.clients}</div>
                  <div style={{ fontSize: "1.15vw", fontWeight: 600, color: "#f0f4ff" }}>{row.partners}</div>
                  <div style={{ fontSize: "1.05vw", color: "#94a3b8", lineHeight: 1.4 }}>{row.milestone}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "2vw", marginTop: "2.5vh" }}>
              <div style={{ flex: 1, background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "1.8vh 1.5vw" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b", marginBottom: "0.5vh" }}>Growth Rate</div>
                <div style={{ fontSize: "1.05vw", color: "#94a3b8" }}>4× → 3× → 2.7× → 2.4× — disciplined deceleration as scale compounds</div>
              </div>
              <div style={{ flex: 1, background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "1.8vh 1.5vw" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6", marginBottom: "0.5vh" }}>Marcus's Seal</div>
                <div style={{ fontSize: "1.05vw", color: "#94a3b8", fontStyle: "italic" }}>"These projections assume no viral moments and no enterprise deals. They are conservative. I approved them."</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
