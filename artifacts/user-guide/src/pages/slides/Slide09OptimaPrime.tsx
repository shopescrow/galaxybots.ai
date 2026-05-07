export default function Slide09OptimaPrime() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 45%, rgba(59,130,246,0.15) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div style={{ width: "40%", paddingRight: "5vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", padding: "0.6vh 1.2vw", display: "inline-flex", marginBottom: "2vh", alignSelf: "flex-start" }}>
            <span style={{ fontSize: "1vw", fontWeight: 700, color: "#3b82f6", letterSpacing: "0.08em", textTransform: "uppercase" }}>AI Commander</span>
          </div>
          <h1 className="font-display" style={{ fontSize: "4vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
            Optima Prime
          </h1>
          <p style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.7, marginBottom: "3vh" }}>
            Optima Prime is the intelligence layer behind every team deployment. When you submit an objective, it doesn't just pick a list of bots — it <span style={{ color: "#f0f4ff", fontWeight: 600 }}>analyzes your goal</span> across all departments to understand which expertise is actually required.
          </p>
          <div className="quote-panel" style={{ borderRadius: "6px", borderLeft: "0.3vw solid #3b82f6", background: "rgba(59,130,246,0.06)" }}>
            <div style={{ fontSize: "1.1vw", color: "#cbd5e1", fontStyle: "italic" }}>
              "Every team you deploy is precisely matched to the mission."
            </div>
          </div>
        </div>

        <div style={{ width: "60%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2.5vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh" }}>
            <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(59,130,246,0.3)" }}>
              <div style={{ fontSize: "2vw", marginBottom: "1vh" }}>🔎</div>
              <div style={{ fontSize: "1.2vw", color: "#3b82f6", fontWeight: 700, marginBottom: "0.8vh" }}>Analyzes the Objective</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                Reviews your goal across all nine departments to map the expertise the work actually demands.
              </div>
            </div>

            <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(139,92,246,0.3)" }}>
              <div style={{ fontSize: "2vw", marginBottom: "1vh" }}>✅</div>
              <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "0.8vh" }}>Proposes the Right Specialists</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                Recommends the specific executives best suited to your task — not just department heads, but the exact right people.
              </div>
            </div>

            <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(16,185,129,0.3)" }}>
              <div style={{ fontSize: "2vw", marginBottom: "1vh" }}>➕</div>
              <div style={{ fontSize: "1.2vw", color: "#10b981", fontWeight: 700, marginBottom: "0.8vh" }}>Suggests New Bots</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                If your objective needs a capability not on your current roster, Optima Prime flags the gap and recommends additions.
              </div>
            </div>

            <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(245,158,11,0.3)" }}>
              <div style={{ fontSize: "2vw", marginBottom: "1vh" }}>🎯</div>
              <div style={{ fontSize: "1.2vw", color: "#f59e0b", fontWeight: 700, marginBottom: "0.8vh" }}>Mission-Matched Teams</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
                No generic assemblies. Every team composition is unique to your specific goal and context.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)" }} />
    </div>
  );
}
