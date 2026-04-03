export default function Slide10Mobile() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1530 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 80% 60%, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ width: "38%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Mobile Command</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh", marginBottom: "2vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
              GalaxyBots Mobile
            </h1>
            <p style={{ fontSize: "1.25vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2vh" }}>
              Your entire AI executive team in your pocket. Command. Approve. Review. From anywhere.
            </p>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.2vh 1.2vw", marginBottom: "1.5vh" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>Operator Rex</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Director of Operations</div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "Executives don't sit at desks. The mobile app ensures our platform fits their life — not the other way around."
            </div>
            <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Operator Rex</div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", gap: "2.5vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh", height: "100%" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ width: "3vw", height: "3vw", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5vh" }}>
                <div style={{ width: "1.5vw", height: "1.5vw", background: "#3b82f6", borderRadius: "4px" }} />
              </div>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.8vh" }}>Command Center</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Fleet health, active sessions, and real-time metrics across all 51 AI directors at a glance</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ width: "3vw", height: "3vw", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5vh" }}>
                <div style={{ width: "1.5vw", height: "1.5vw", background: "#f59e0b", borderRadius: "4px" }} />
              </div>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.8vh" }}>Governance & Approvals</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Human-in-the-loop compliance — approve or reject AI actions from your phone in seconds</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ width: "3vw", height: "3vw", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5vh" }}>
                <div style={{ width: "1.5vw", height: "1.5vw", background: "#3b82f6", borderRadius: "4px" }} />
              </div>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.8vh" }}>ROI Reports</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Shareable value reports per client — one tap to send a white-labeled executive summary</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
              <div style={{ width: "3vw", height: "3vw", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5vh" }}>
                <div style={{ width: "1.5vw", height: "1.5vw", background: "#f59e0b", borderRadius: "4px" }} />
              </div>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.8vh" }}>Daily Journal</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>AI-generated daily brief — boardroom highlights, decisions made, and next priorities summarized overnight</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
