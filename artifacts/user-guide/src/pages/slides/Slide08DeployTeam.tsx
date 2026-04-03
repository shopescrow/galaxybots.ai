export default function Slide08DeployTeam() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(139,92,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "5vh 6vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Step 6 of 8</span>
          <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)", marginTop: "1vh", marginBottom: "1.5vh" }} />
          <h1 className="font-display" style={{ fontSize: "3.5vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "0.8vh" }}>
            Deploy a Team
          </h1>
          <p style={{ fontSize: "1.3vw", color: "#94a3b8" }}>
            For larger, multi-department objectives — Deploy Team assembles a coordinated group of specialists around a single goal.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "2vw", flex: 1 }}>
          {[
            { num: "1", label: "Define Objective", detail: "Describe what needs to be accomplished in plain language.", icon: "🎯", color: "#8b5cf6" },
            { num: "2", label: "Optima Prime Analyzes", detail: "Your AI Commander reviews the goal and determines which expertise is needed.", icon: "🧠", color: "#3b82f6" },
            { num: "3", label: "Team Assembled", detail: "The correct specialists are selected automatically — no manual configuration.", icon: "👥", color: "#10b981" },
            { num: "4", label: "Task Room Launched", detail: "All bots work together in one shared workspace toward one goal.", icon: "🚀", color: "#f59e0b" },
          ].map(({ num, label, detail, icon, color }, i) => (
            <div key={num} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              {i < 3 && (
                <div style={{ position: "absolute", right: "-1vw", top: "4vw", fontSize: "1.5vw", color: "#1a2240", zIndex: 1 }}>→</div>
              )}
              <div style={{ width: "6vw", height: "6vw", background: `${color}22`, border: `2px solid ${color}55`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2vh" }}>
                <span style={{ fontSize: "2.5vw" }}>{icon}</span>
              </div>
              <div style={{ background: "rgba(139,92,246,0.1)", borderRadius: "50%", width: "2.5vw", height: "2.5vw", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5vh", border: `1px solid ${color}44` }}>
                <span style={{ fontSize: "1.1vw", fontWeight: 700, color }}>{num}</span>
              </div>
              <div className="font-display" style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff", textAlign: "center", marginBottom: "1vh" }}>{label}</div>
              <div style={{ fontSize: "1vw", color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>{detail}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "2.5vh" }}>
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "6px", padding: "2vh 2vw", display: "flex", alignItems: "center", gap: "2vw" }}>
            <div style={{ fontSize: "2vw" }}>💡</div>
            <div style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.5 }}>
              Rather than working with one bot at a time, <span style={{ color: "#f0f4ff", fontWeight: 600 }}>Deploy Team</span> coordinates multiple specialists simultaneously — ideal for strategic initiatives, product launches, and cross-functional projects.
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981, #f59e0b)" }} />
    </div>
  );
}
