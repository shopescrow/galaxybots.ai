export default function Slide12Closing() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(139,92,246,0.18) 0%, transparent 70%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 40% at 20% 80%, rgba(59,130,246,0.08) 0%, transparent 60%)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: "6vh 8vw" }}>
        <div style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: "8px", padding: "0.8vh 2vw", marginBottom: "2.5vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#10b981", letterSpacing: "0.12em", textTransform: "uppercase" }}>You're Ready</span>
        </div>

        <h1 className="font-display" style={{ fontSize: "5vw", fontWeight: 700, color: "#f0f4ff", textAlign: "center", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          You're Ready to Lead.
        </h1>
        <p style={{ fontSize: "1.6vw", color: "#94a3b8", textAlign: "center", marginBottom: "4vh" }}>
          Your AI executive team is standing by.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5vw", width: "80vw", marginBottom: "4vh" }}>
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "10px", padding: "2.5vh 2vw", textAlign: "center" }}>
            <div style={{ fontSize: "2.5vw", marginBottom: "1vh" }}>🤖</div>
            <div className="font-display" style={{ fontSize: "1.4vw", fontWeight: 700, color: "#8b5cf6", marginBottom: "0.8vh" }}>Bots</div>
            <div style={{ fontSize: "1vw", color: "#94a3b8", lineHeight: 1.5 }}>Direct conversations with individual specialists — your private channel to any executive on demand.</div>
          </div>

          <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 2vw", textAlign: "center" }}>
            <div style={{ fontSize: "2.5vw", marginBottom: "1vh" }}>🚀</div>
            <div className="font-display" style={{ fontSize: "1.4vw", fontWeight: 700, color: "#3b82f6", marginBottom: "0.8vh" }}>Deploy Team</div>
            <div style={{ fontSize: "1vw", color: "#94a3b8", lineHeight: 1.5 }}>Coordinated missions for complex, multi-department objectives — assembled by Optima Prime.</div>
          </div>

          <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "10px", padding: "2.5vh 2vw", textAlign: "center" }}>
            <div style={{ fontSize: "2.5vw", marginBottom: "1vh" }}>📡</div>
            <div className="font-display" style={{ fontSize: "1.4vw", fontWeight: 700, color: "#10b981", marginBottom: "0.8vh" }}>Command Center</div>
            <div style={{ fontSize: "1vw", color: "#94a3b8", lineHeight: 1.5 }}>Full oversight — Activity Feed, Pending Approvals, and Company Status all in one place.</div>
          </div>
        </div>

        <div style={{ width: "6vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #8b5cf6, transparent)", marginBottom: "3vh" }} />

        <p className="font-display" style={{ fontSize: "2vw", fontWeight: 700, color: "#8b5cf6", textAlign: "center", fontStyle: "italic", marginBottom: "1vh" }}>
          GalaxyBots.ai
        </p>
        <p style={{ fontSize: "1.4vw", color: "#94a3b8", textAlign: "center" }}>
          Fortune 500 intelligence, at your command. Welcome to your team.
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981, #8b5cf6)" }} />
    </div>
  );
}
