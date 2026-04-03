export default function Slide05Market() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 20% 60%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div style={{ width: "38%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "1.2vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Market Opportunity</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh", marginBottom: "2.5vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
              $500B Market. We Own the Premium Niche.
            </h1>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.5vh 1.5vw", marginBottom: "2vh" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>FP&A Oracle Demi</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Director of Financial Planning & Analysis</div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.3vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "We are not chasing the AI market broadly. We are targeting the highest-value, underserved segment: companies smart enough to know they need a board, but priced out of one."
            </div>
            <div style={{ marginTop: "1.5vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— FP&A Oracle Demi</div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", gap: "2.5vh" }}>
          <div style={{ display: "flex", gap: "2vh" }}>
            <div style={{ flex: 1, background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1vh" }}>TAM</div>
              <div className="font-display" style={{ fontSize: "4vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1, marginBottom: "0.8vh" }}>$500B</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Global AI SaaS market by 2030 (Gartner). We are positioned at the highest-margin, highest-intent segment.</div>
            </div>
            <div style={{ flex: 1, background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f59e0b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1vh" }}>SAM</div>
              <div className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1, marginBottom: "0.8vh" }}>32M SMEs</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>+ 500K digital agencies globally who need executive-grade AI but cannot afford human executive teams</div>
            </div>
          </div>

          <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.5vh" }}>SOM — Year 1–3 Beachhead</div>
            <div style={{ display: "flex", gap: "3vw" }}>
              <div>
                <div className="font-display" style={{ fontSize: "2.8vw", fontWeight: 700, color: "#f59e0b" }}>50,000</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>U.S.-based growth-stage companies ($1M–$50M revenue)</div>
              </div>
              <div style={{ width: "0.1vw", background: "#1a2240" }} />
              <div>
                <div className="font-display" style={{ fontSize: "2.8vw", fontWeight: 700, color: "#f59e0b" }}>5,000</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Digital marketing agencies — our white-label distribution army</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
