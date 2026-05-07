export default function Slide03Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 60% at 80% 30%, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div className="flex flex-col justify-between" style={{ width: "40%", paddingRight: "4vw" }}>
          <div>
            <div style={{ marginBottom: "1.5vh" }}>
              <span style={{ fontSize: "1.2vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>The Problem</span>
            </div>
            <div className="gold-rule" style={{ width: "5vw", marginBottom: "2.5vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.8vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
              76% of SMEs Have No C-Suite
            </h1>
            <p style={{ fontSize: "1.4vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "3vh" }}>
              The gap between enterprise intelligence and SME reality is massive — and growing.
            </p>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.5vh 1.5vw", marginBottom: "1.5vh" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>Magnus Drake</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Managing Director</div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.3vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "The market is not waiting for us to be ready. Every day a company operates without strategic intelligence is a day our competitor earns their trust."
            </div>
            <div style={{ marginTop: "1.5vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Magnus Drake</div>
          </div>
        </div>

        <div style={{ width: "60%", display: "flex", flexDirection: "column", gap: "2.5vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh", flex: 1 }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "3.5vw", fontWeight: 700, color: "#ef4444", fontFamily: "Space Grotesk", marginBottom: "1vh" }}>$5M</div>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", fontWeight: 600, marginBottom: "0.8vh" }}>Annual C-Suite Cost</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>SMEs pay $1M–$5M/yr for a full executive team — unaffordable for 99% of businesses</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "3.5vw", fontWeight: 700, color: "#ef4444", fontFamily: "Space Grotesk", marginBottom: "1vh" }}>76%</div>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", fontWeight: 600, marginBottom: "0.8vh" }}>No Executive Team</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Decisions made by gut instinct, not data — strategic risk that compounds over time</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.6vw", fontWeight: 700, color: "#f59e0b", fontFamily: "Space Grotesk", marginBottom: "1vh" }}>No Memory</div>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", fontWeight: 600, marginBottom: "0.8vh" }}>Generic AI Fails</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>ChatGPT wrappers have no domain expertise or institutional memory — not real executives</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.6vw", fontWeight: 700, color: "#f59e0b", fontFamily: "Space Grotesk", marginBottom: "1vh" }}>The Gap</div>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", fontWeight: 600, marginBottom: "0.8vh" }}>Market Opportunity</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>32M SMEs globally need executive intelligence but have no affordable path to get it</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
