export default function Slide07ProductGalaxyBots() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 80% 50%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ width: "36%", paddingRight: "3.5vw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Product Platform</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh", marginBottom: "2vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
              GalaxyBots.ai Platform
            </h1>
            <p style={{ fontSize: "1.25vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2vh" }}>
              51 AI Directors across 9 departments — the world's most complete AI executive team.
            </p>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.2vh 1.2vw", marginBottom: "1.5vh" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>Product Oracle Sasha</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Director of Product Management</div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "Every feature we ship answers one question: did this make our client measurably smarter? If not, it doesn't ship."
            </div>
            <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Product Oracle Sasha</div>
          </div>
        </div>

        <div style={{ width: "64%", display: "flex", flexDirection: "column", gap: "2vh", }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh", height: "100%" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", marginBottom: "1.2vh" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#3b82f6", borderRadius: "50%" }} />
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>51 AI Directors</div>
              </div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>9 departments: Board, Executive, Operations, Sales, Finance, Legal, Technology, HR, Creative & Specialized roles</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", marginBottom: "1.2vh" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#f59e0b", borderRadius: "50%" }} />
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>Virtual Boardroom</div>
              </div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Multi-agent collaboration on complex missions — bots debate, align, and co-author strategy together</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", marginBottom: "1.2vh" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#3b82f6", borderRadius: "50%" }} />
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>Mission Library</div>
              </div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Autonomous background task execution — the AI team works while you sleep</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", marginBottom: "1.2vh" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#f59e0b", borderRadius: "50%" }} />
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>Institutional Memory</div>
              </div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Persistent context across all sessions — every bot remembers your company, goals, and history</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2vh 1.8vw", gridColumn: "span 2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", marginBottom: "1.2vh" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#3b82f6", borderRadius: "50%" }} />
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>ROI Dashboard</div>
              </div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Real-time proof-of-value metrics — clients see exactly what the AI team has delivered in dollars and decisions</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
