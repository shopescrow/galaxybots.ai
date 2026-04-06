export default function Slide03CommandCenter() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "5vh 6vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Step 2 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginTop: "1vh", marginBottom: "1.5vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Your Command Center
          </h1>
          <p style={{ fontSize: "1.3vw", color: "#94a3b8", marginTop: "1vh" }}>
            Your operations hub — everything happening across your AI team is visible here.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5vw", flex: 1, alignItems: "center" }}>
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "10px", padding: "3vh 2vw", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(139,92,246,0.1))", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5vh" }}>
              <span style={{ fontSize: "1.8vw" }}>📡</span>
            </div>
            <div className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: "#8b5cf6" }}>Activity Feed</div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>
              A live log of every action your bots are taking — in real time, across all departments and channels.
            </div>
            <div style={{ marginTop: "auto", fontSize: "1vw", color: "#4a5568", fontStyle: "italic" }}>
              Never miss a bot action
            </div>
          </div>

          <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "3vh 2vw", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(59,130,246,0.1))", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5vh" }}>
              <span style={{ fontSize: "1.8vw" }}>✅</span>
            </div>
            <div className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: "#3b82f6" }}>Pending Approvals</div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>
              Any actions that require your sign-off before they proceed. You stay in control of consequential decisions.
            </div>
            <div style={{ marginTop: "auto", fontSize: "1vw", color: "#4a5568", fontStyle: "italic" }}>
              Govern every bot action
            </div>
          </div>

          <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "10px", padding: "3vh 2vw", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(16,185,129,0.1))", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5vh" }}>
              <span style={{ fontSize: "1.8vw" }}>🏢</span>
            </div>
            <div className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: "#10b981" }}>Company Status</div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>
              A real-time view of your entire fleet's health at a glance — which bots are active, idle, or awaiting instruction.
            </div>
            <div style={{ marginTop: "auto", fontSize: "1vw", color: "#4a5568", fontStyle: "italic" }}>
              Monitor your full fleet
            </div>
          </div>
        </div>

        <div style={{ marginTop: "2.5vh" }}>
          <div className="quote-panel" style={{ borderRadius: "6px", borderLeft: "0.3vw solid #8b5cf6" }}>
            <div style={{ fontSize: "1.3vw", color: "#cbd5e1", fontStyle: "italic" }}>
              "Think of the Command Center as mission control — this is where you stay informed and in charge."
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981)" }} />
    </div>
  );
}
