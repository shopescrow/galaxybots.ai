export default function Slide06Competitive() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 70% 40%, rgba(245,158,11,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.2vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Competitive Landscape</span>
          <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "30%", display: "flex", flexDirection: "column", gap: "2vh" }}>
            <h1 className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              Our Moat Is Uncopyable
            </h1>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.5vh 1.5vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>Growth Hawk Yusuf</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Director of Business Development</div>
            </div>
            <div className="quote-panel" style={{ borderRadius: "6px", flex: 1 }}>
              <div style={{ fontSize: "1.25vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "Our white-label partner channel is the single biggest competitive advantage no one can copy quickly. We will own the agency layer before anyone else knows it exists."
              </div>
              <div style={{ marginTop: "1.5vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Growth Hawk Yusuf</div>
            </div>
          </div>

          <div style={{ width: "70%", display: "flex", flexDirection: "column", gap: "2vh", }}>
            <div style={{ display: "flex", gap: "2vh", marginBottom: "2vh" }}>
              <div style={{ flex: 1, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "2vh 1.5vw" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#ef4444", marginBottom: "0.8vh" }}>Below Us</div>
                <div style={{ fontSize: "1.2vw", fontWeight: 600, color: "#f0f4ff", marginBottom: "0.8vh" }}>Generic AI (ChatGPT, Copilot, Gemini)</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>No domain depth · No memory · No team collaboration · No institutional context</div>
              </div>
              <div style={{ flex: 1, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "2vh 1.5vw" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#ef4444", marginBottom: "0.8vh" }}>Above Us</div>
                <div style={{ fontSize: "1.2vw", fontWeight: 600, color: "#f0f4ff", marginBottom: "0.8vh" }}>Custom Enterprise AI ($500K+)</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Unaffordable for SMEs · 12–18 month buildout · Zero off-the-shelf readiness</div>
              </div>
            </div>

            <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(245,158,11,0.08))", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#3b82f6", marginBottom: "2vh" }}>GalaxyBots — The Unique Wedge</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5vh" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#f59e0b", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}>White-label partner channel — no competitor has it at scale</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#f59e0b", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}>Cloud 9 Score™ — we own the AEO category metric</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#3b82f6", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}>Institutional Memory — bots remember your company across every session</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#3b82f6", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}>Virtual Boardroom — cross-agent collaboration no tool replicates</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
