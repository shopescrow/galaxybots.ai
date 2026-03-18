export default function Slide04BotRoster() {
  const bots = [
    { role: "CFO Bot", icon: "💰", desc: "Financial analysis, P&L review, cost optimization, and budget forecasting — your finance executive.", dept: "Finance" },
    { role: "Marketing Director", icon: "📣", desc: "Campaign strategy, brand positioning, content planning, and competitive intelligence.", dept: "Marketing" },
    { role: "CMO Bot", icon: "🎯", desc: "Go-to-market strategy, lead generation, Prospector pipeline, and growth analysis.", dept: "Growth" },
  ];
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,168,83,0.06) 0%, transparent 55%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 3</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Meet Your Bot Team
        </h2>
        <p style={{ fontFamily: "Inter", fontSize: "1.6vw", color: "#6B7296", marginBottom: "4vh" }}>
          Navigate to the Bots page to see your full corporate roster
        </p>
        <div style={{ display: "flex", gap: "2.5vw", flex: 1 }}>
          {bots.map((bot) => (
            <div key={bot.role} style={{ flex: 1, background: "#0E1029", border: "1px solid rgba(212,168,83,0.2)", borderRadius: "1.2vw", padding: "3vh 2.5vw", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ width: "6vw", height: "6vw", borderRadius: "50%", background: "rgba(212,168,83,0.10)", border: "2px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5vw" }}>
                {bot.icon}
              </div>
              <div>
                <div style={{ fontFamily: "Outfit", fontSize: "2vw", fontWeight: 700, color: "#E8EAF0", marginBottom: "0.5vh" }}>{bot.role}</div>
                <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5vh" }}>{bot.dept}</div>
                <div style={{ fontFamily: "Inter", fontSize: "1.5vw", color: "#6B7296", lineHeight: 1.5 }}>{bot.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "2.5vh", fontFamily: "Inter", fontSize: "1.5vw", color: "#3D7FE8", fontWeight: 500 }}>
          → Bots in the left sidebar
        </div>
      </div>
    </div>
  );
}
