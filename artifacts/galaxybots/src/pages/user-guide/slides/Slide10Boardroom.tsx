export default function Slide10Boardroom() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 70% 40%, rgba(139,92,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div style={{ width: "38%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh", display: "block" }}>Step 7 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginBottom: "2vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
            Lead Your Task Boardroom
          </h1>
          <p style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2vh" }}>
            Once your team is deployed, you enter a shared workspace where you can direct the full team simultaneously in one place. You're in charge.
          </p>
          <div className="quote-panel" style={{ borderRadius: "6px", borderLeft: "0.3vw solid #8b5cf6", background: "rgba(139,92,246,0.06)" }}>
            <div style={{ fontSize: "1.1vw", color: "#cbd5e1", fontStyle: "italic" }}>
              "The Boardroom is where strategy becomes execution."
            </div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          {[
            { icon: "📋", label: "Assign Tasks & Set Priorities", detail: "Direct your full team simultaneously from one shared space. Assign specific tasks to specific bots, set priorities, and define deadlines.", color: "#8b5cf6" },
            { icon: "↩", label: "Redirect Focus at Any Time", detail: "If priorities shift mid-session, redirect any bot instantly without interrupting the work of other team members.", color: "#3b82f6" },
            { icon: "➕", label: "Add Specialists Mid-Session", detail: "Realize you need another expert? Request additional specialists to join the Boardroom without stopping the flow.", color: "#10b981" },
            { icon: "📊", label: "Real-Time Tracking", detail: "Every action your bots take is tracked live — nothing happens without a record. Full transparency, complete accountability.", color: "#f59e0b" },
          ].map(({ icon, label, detail, color }) => (
            <div key={label} className="stat-card" style={{ padding: "2vh 2vw", display: "flex", alignItems: "flex-start", gap: "1.5vw", borderColor: `rgba(${color === "#8b5cf6" ? "139,92,246" : color === "#3b82f6" ? "59,130,246" : color === "#10b981" ? "16,185,129" : "245,158,11"},0.3)` }}>
              <div style={{ width: "3vw", height: "3vw", background: `${color}22`, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "1.3vw" }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color, marginBottom: "0.5vh" }}>{label}</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981, #f59e0b)" }} />
    </div>
  );
}
