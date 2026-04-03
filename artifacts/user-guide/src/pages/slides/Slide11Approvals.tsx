export default function Slide11Approvals() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "5vh 6vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Step 8 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginTop: "1vh", marginBottom: "1.5vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Managing Approvals
          </h1>
          <p style={{ fontSize: "1.3vw", color: "#94a3b8", marginTop: "1vh" }}>
            Your bots are powerful — for consequential actions, they request your approval before proceeding.
          </p>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1, alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ fontSize: "1.1vw", color: "#8b5cf6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>The Approval Flow</div>

            {[
              { step: "1", icon: "🤖", label: "Bot Surfaces a Request", detail: "Your bot identifies an action it needs to take — sending communications, making recommendations, or executing tasks on your behalf.", color: "#8b5cf6" },
              { step: "2", icon: "🔍", label: "Review in Pending Approvals", detail: "The request appears in your Command Center under Pending Approvals. Review what the bot wants to do and why.", color: "#3b82f6" },
              { step: "3A", icon: "✅", label: "Approve — Bot Proceeds", detail: "Grant approval and the bot executes the action immediately.", color: "#10b981" },
              { step: "3B", icon: "🚫", label: "Reject — Action Stopped", detail: "Reject and the action is cancelled. The bot receives your feedback and awaits further instruction.", color: "#ef4444" },
            ].map(({ step, icon, label, detail, color }) => (
              <div key={step} className="stat-card" style={{ padding: "1.8vh 1.5vw", display: "flex", alignItems: "flex-start", gap: "1.2vw", borderColor: `${color}44` }}>
                <div style={{ width: "3vw", height: "3vw", background: `${color}22`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.3vw" }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6vw", marginBottom: "0.4vh" }}>
                    <span style={{ background: `${color}22`, borderRadius: "3px", padding: "0.1vh 0.5vw", fontSize: "0.9vw", color, fontWeight: 700 }}>{step}</span>
                    <span style={{ fontSize: "1.1vw", fontWeight: 700, color }}>{label}</span>
                  </div>
                  <div style={{ fontSize: "1vw", color: "#94a3b8", lineHeight: 1.5 }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ width: "35%", display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "10px", padding: "3vh 2vw" }}>
              <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "1.5vh" }}>What Triggers an Approval?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1vh" }}>
                {["Sending communications on your behalf", "Making formal recommendations", "Executing tasks with external impact", "Accessing sensitive data"].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
                    <span style={{ color: "#8b5cf6", fontSize: "1vw" }}>◆</span>
                    <span style={{ fontSize: "1vw", color: "#94a3b8" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "10px", padding: "2vh 2vw" }}>
              <div style={{ fontSize: "1.2vw", color: "#10b981", fontWeight: 700, marginBottom: "1vh" }}>Complete Audit Trail</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>
                Every approval or rejection is logged — who approved, when, and what action was authorized or stopped.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981)" }} />
    </div>
  );
}
