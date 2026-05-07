export default function Slide04BotTeam() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 60%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 70% 40%, rgba(139,92,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div style={{ width: "35%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh", display: "block" }}>Step 3 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginBottom: "2vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
            Meet Your Bot Team
          </h1>
          <p style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2.5vh" }}>
            GalaxyBots comes pre-loaded with a full corporate roster of AI executives, each specialized in a distinct business function.
          </p>
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "6px", padding: "1.5vh 1.2vw" }}>
            <div style={{ fontSize: "1.1vw", color: "#8b5cf6", fontWeight: 600, marginBottom: "0.5vh" }}>Full Roster Available</div>
            <div style={{ fontSize: "1vw", color: "#94a3b8" }}>Explore the Bots section to see your complete team across all departments.</div>
          </div>
        </div>

        <div style={{ width: "65%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(139,92,246,0.3)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
              <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.6vw" }}>💼</span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="font-display" style={{ fontSize: "1.5vw", fontWeight: 700, color: "#8b5cf6", marginBottom: "0.5vh" }}>CFO Bot</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Financial analysis, P&L review, cost optimization, and budget forecasting — your finance executive, on demand.</div>
              </div>
            </div>
          </div>

          <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(59,130,246,0.3)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
              <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.6vw" }}>📣</span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="font-display" style={{ fontSize: "1.5vw", fontWeight: 700, color: "#3b82f6", marginBottom: "0.5vh" }}>Marketing Director</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Campaign strategy, brand positioning, content planning, and competitive intelligence.</div>
              </div>
            </div>
          </div>

          <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(16,185,129,0.3)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
              <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, #10b981, #059669)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.6vw" }}>🚀</span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="font-display" style={{ fontSize: "1.5vw", fontWeight: 700, color: "#10b981", marginBottom: "0.5vh" }}>CMO Bot</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Go-to-market strategy, lead generation, Prospector pipeline management, and growth analysis.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981)" }} />
    </div>
  );
}
