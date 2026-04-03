export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(139,92,246,0.15) 0%, transparent 70%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 75% 70%, rgba(59,130,246,0.1) 0%, transparent 60%)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: "6vh 8vw" }}>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: "2.8vw", height: "2.8vw", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "1.1vw", color: "#fff", fontWeight: 700 }}>GB</span>
          </div>
          <span className="font-display" style={{ fontSize: "1.5vw", fontWeight: 600, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase" }}>GalaxyBots.ai</span>
        </div>

        <div style={{ width: "6vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #8b5cf6, transparent)", marginBottom: "4vh" }} />

        <h1 className="font-display" style={{ fontSize: "5.5vw", fontWeight: 700, color: "#f0f4ff", textAlign: "center", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
          Your AI Executive Team
        </h1>
        <h1 className="font-display" style={{ fontSize: "5.5vw", fontWeight: 700, color: "#8b5cf6", textAlign: "center", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "3.5vh" }}>
          Starts Here
        </h1>

        <div style={{ width: "6vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #3b82f6, transparent)", marginBottom: "4vh" }} />

        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "8px", padding: "2.5vh 3vw", maxWidth: "65vw", textAlign: "center", marginBottom: "4vh" }}>
          <p style={{ fontSize: "1.8vw", color: "#cbd5e1", lineHeight: 1.6, fontWeight: 400 }}>
            In this guide, you'll learn how to <span style={{ color: "#f0f4ff", fontWeight: 600 }}>log in</span>, connect with your <span style={{ color: "#f0f4ff", fontWeight: 600 }}>bots</span>, deploy a <span style={{ color: "#f0f4ff", fontWeight: 600 }}>full team</span>, and stay in control through your <span style={{ color: "#f0f4ff", fontWeight: 600 }}>Command Center</span>.
          </p>
        </div>

        <div className="flex items-center gap-8">
          {["Log In", "Meet Your Bots", "Deploy a Team", "Command Center"].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div style={{ width: "2vh", height: "2vh", borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "0.9vw", color: "#fff", fontWeight: 700 }}>{i + 1}</span>
              </div>
              <span style={{ fontSize: "1.2vw", color: "#94a3b8", fontWeight: 500 }}>{step}</span>
              {i < 3 && <span style={{ fontSize: "1.2vw", color: "#1a2240", marginLeft: "0.5vw" }}>›</span>}
            </div>
          ))}
        </div>

        <p className="font-display" style={{ fontSize: "1.4vw", color: "#8b5cf6", marginTop: "4vh", fontStyle: "italic" }}>
          Fortune 500 intelligence, at your command.
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #8b5cf6)" }} />
    </div>
  );
}
