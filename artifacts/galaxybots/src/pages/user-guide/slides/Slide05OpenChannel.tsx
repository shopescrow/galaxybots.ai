export default function Slide05OpenChannel() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div style={{ width: "38%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh", display: "block" }}>Step 4 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginBottom: "2vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
            Open a Channel
          </h1>
          <p style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2vh" }}>
            Open a direct, private line with any specialist on your team. Each channel is dedicated to that bot — keeping your conversations focused and history organized.
          </p>
          <div className="quote-panel" style={{ borderRadius: "6px", borderLeft: "0.3vw solid #8b5cf6", background: "rgba(139,92,246,0.06)" }}>
            <div style={{ fontSize: "1.1vw", color: "#cbd5e1", fontStyle: "italic" }}>
              "Your secure, private line to that executive is now live and ready for instructions."
            </div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2.5vh" }}>
          <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5vh" }}>How to Open a Channel</div>

          {[
            { step: "1", icon: "☰", label: "Navigate to Bots", detail: "In the left sidebar, click on Bots to access your full executive roster.", color: "#8b5cf6" },
            { step: "2", icon: "🔍", label: "Browse & Select a Specialist", detail: "Find the expert you need — for example, the CMO Bot from the Growth Department.", color: "#3b82f6" },
            { step: "3", icon: "⚡", label: "Click Open Channel", detail: "That's it. Your private, dedicated workspace with that executive is instantly live.", color: "#10b981" },
          ].map(({ step, icon, label, detail, color }) => (
            <div key={step} className="stat-card" style={{ padding: "2vh 2vw", display: "flex", alignItems: "flex-start", gap: "1.5vw", borderColor: `rgba(${color === "#8b5cf6" ? "139,92,246" : color === "#3b82f6" ? "59,130,246" : "16,185,129"},0.3)` }}>
              <div style={{ width: "3.5vw", height: "3.5vw", background: `${color}22`, border: `1px solid ${color}44`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.5vw" }}>{icon}</span>
              </div>
              <div>
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color, marginBottom: "0.5vh" }}>
                  <span style={{ background: `${color}22`, borderRadius: "3px", padding: "0.1vh 0.5vw", marginRight: "0.5vw", fontSize: "1vw" }}>{step}</span>
                  {label}
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981)" }} />
    </div>
  );
}
