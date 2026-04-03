export default function Slide12UnitEconomics() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(150deg, #0a0e1a 0%, #0c1225 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 20% 50%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 7vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Unit Economics</span>
          <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
        </div>

        <div style={{ display: "flex", gap: "5vw", flex: 1, alignItems: "stretch" }}>
          <div style={{ width: "35%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
                An NRR Above 110% Means We Grow Without New Clients
              </h1>
              <div style={{ display: "flex", gap: "1vw", marginBottom: "2vh" }}>
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1vw" }}>
                  <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>CFO Sentinel Marcus</div>
                </div>
                <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "6px", padding: "0.8vh 1vw" }}>
                  <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>FP&A Oracle Demi</div>
                </div>
              </div>
            </div>
            <div className="quote-panel" style={{ borderRadius: "6px" }}>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "An NRR above 110% means the company grows even if we sign zero new clients. That is the business model we are building toward."
              </div>
              <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— FP&A Oracle Demi</div>
            </div>
          </div>

          <div style={{ width: "65%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vh", alignContent: "center" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 1.5vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#3b82f6", lineHeight: 1 }}>$36K</div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f0f4ff", marginTop: "0.8vh" }}>Target ACV</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Average Contract Value per year</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "2.5vh 1.5vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f59e0b", lineHeight: 1 }}>82%</div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f0f4ff", marginTop: "0.8vh" }}>Gross Margin</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Target by Year 2</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 1.5vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#3b82f6", lineHeight: 1 }}>8:1</div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f0f4ff", marginTop: "0.8vh" }}>LTV:CAC</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Target by Year 3</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "2.5vh 1.5vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f59e0b", lineHeight: 1 }}>&gt;110%</div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f0f4ff", marginTop: "0.8vh" }}>NRR Target</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Net Revenue Retention</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 1.5vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#3b82f6", lineHeight: 1 }}>&lt;9mo</div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f0f4ff", marginTop: "0.8vh" }}>Payback Period</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Target CAC recovery</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(245,158,11,0.08))", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 1.5vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "2.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1 }}>4¢/$1</div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f0f4ff", marginTop: "0.8vh" }}>Cost Advantage</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>vs. human C-Suite</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
