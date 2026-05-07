export default function Slide06Directive() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(139,92,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "5vh 6vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Step 5 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginTop: "1vh", marginBottom: "1.5vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Send Your Directive
          </h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3vw", flex: 1, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <div className="stat-card" style={{ padding: "2.5vh 2vw" }}>
              <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "1vh" }}>Plain Language — No Special Commands</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>
                Your bots understand plain language. Just tell them what you need — they'll interpret and act. No formats, no syntax, no learning curve.
              </div>
            </div>

            <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "6px", padding: "2vh 1.5vw" }}>
              <div style={{ fontSize: "1.1vw", color: "#10b981", fontWeight: 700, marginBottom: "0.8vh" }}>3 Tips for Great Directives</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1vh" }}>
                {["Be specific about what you need", "Mention the time period or scope", "Ask for flags or areas of concern"].map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
                    <div style={{ width: "1.5vw", height: "1.5vw", background: "rgba(16,185,129,0.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.7vw", color: "#10b981" }}>✓</span>
                    </div>
                    <span style={{ fontSize: "1.1vw", color: "#94a3b8" }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "6px", padding: "1.5vh 1.5vw" }}>
              <div style={{ fontSize: "1vw", color: "#8b5cf6", fontWeight: 600, fontStyle: "italic" }}>
                "Be specific, be direct, and your bots will deliver."
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Example in Action</div>

            <div style={{ background: "#111829", border: "1px solid #1a2240", borderRadius: "8px", padding: "2vh 1.5vw" }}>
              <div style={{ fontSize: "0.9vw", color: "#4a5568", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.08em" }}>You → CFO Bot</div>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.6, fontStyle: "italic", borderLeft: "0.2vw solid #8b5cf6", paddingLeft: "1vw" }}>
                "Analyze our Q2 revenue and flag areas of concern."
              </div>
            </div>

            <div style={{ background: "#111829", border: "1px solid #1a2240", borderRadius: "8px", padding: "2vh 1.5vw" }}>
              <div style={{ fontSize: "0.9vw", color: "#4a5568", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.08em" }}>CFO Bot responds immediately</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <span style={{ color: "#10b981", fontSize: "1.1vw", flexShrink: 0 }}>▶</span>
                  <span style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Pulls Q2 revenue data across all accounts</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <span style={{ color: "#f59e0b", fontSize: "1.1vw", flexShrink: 0 }}>⚠</span>
                  <span style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Identifies margin compression in Operations: <span style={{ color: "#f59e0b", fontWeight: 600 }}>-4.2% vs Q1</span></span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8vw" }}>
                  <span style={{ color: "#3b82f6", fontSize: "1.1vw", flexShrink: 0 }}>📋</span>
                  <span style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Flags 3 specific cost centers for your review</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6)" }} />
    </div>
  );
}
