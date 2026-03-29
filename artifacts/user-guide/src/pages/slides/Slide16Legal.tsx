export default function Slide16Legal() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 20% 60%, rgba(245,158,11,0.04) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ width: "38%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Legal & IP Strategy</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh", marginBottom: "2vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
              The Moat Is Technology AND Legal Architecture
            </h1>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.2vh 1.2vw", marginBottom: "2vh" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>General Counsel Alexis</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Director of Legal Affairs</div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.25vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "The moat is not just technology. It is the legal architecture around that technology. We build both simultaneously."
            </div>
            <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— General Counsel Alexis</div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", gap: "2vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#3b82f6", marginBottom: "1vh" }}>Trademark Filings</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                "Cloud 9 Score™" and "GalaxyBots™" trademarked in all target markets: U.S., UK, Canada, Australia, EU (Year 4)
              </div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1vh" }}>Trade Secrets</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                Bot personality frameworks and Institutional Memory architecture filed as trade secrets — not patents, which disclose the method
              </div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#3b82f6", marginBottom: "1vh" }}>Partner Contracts</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                Robust reseller agreements protecting platform IP while enabling partner flexibility — every partner is contractually bound
              </div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1vh" }}>Compliance Roadmap</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                SOC 2 Type II: Year 2 · GDPR alignment: Year 4 EU expansion · Enterprise data governance from Day 1
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
