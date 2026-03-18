export default function Slide13QuickStart() {
  const steps = [
    { n: 1, title: "Log In", desc: "Navigate to your GalaxyBots URL and sign in with your credentials" },
    { n: 2, title: "Command Center", desc: "Your ops hub — activity feed, approvals, and company status" },
    { n: 3, title: "Meet Your Bots", desc: "Visit Bots in the left nav to see your full corporate roster" },
    { n: 4, title: "Open a Channel", desc: "Select a specialist and click \"Open Channel\" for a direct line" },
    { n: 5, title: "Send a Directive", desc: "Use plain language — your bots interpret and act immediately" },
    { n: 6, title: "Deploy a Team", desc: "Use Deploy Team for complex goals requiring multiple specialists" },
    { n: 7, title: "Lead the Boardroom", desc: "Direct your full team in one collaborative task space" },
    { n: 8, title: "Manage Approvals", desc: "Review and approve all consequential bot actions in Command Center" },
  ];
  const nav = [
    { name: "Command Center", desc: "Activity, approvals, status" },
    { name: "Bots", desc: "Your full AI roster" },
    { name: "Deploy Team", desc: "Multi-bot task launch" },
    { name: "Boardroom", desc: "Team collaboration space" },
    { name: "Approvals", desc: "Governance & sign-offs" },
  ];
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 60% at 50% 0%, rgba(212,168,83,0.06) 0%, transparent 55%)" }} />
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div style={{ display: "flex", alignItems: "baseline", gap: "2vw", marginBottom: "0.5vh" }}>
          <h2 style={{ fontFamily: "Outfit", fontSize: "3.2vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em" }}>Quick Start Card</h2>
          <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#6B7296" }}>Everything you need in 30 seconds</div>
        </div>
        <div style={{ width: "5vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <div style={{ border: "1px solid rgba(212,168,83,0.25)", borderRadius: "1vw", padding: "2.5vh 2.5vw", flex: 1, display: "flex", flexDirection: "column", gap: "2vh", background: "rgba(14,16,41,0.6)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2vh 4vw" }}>
            {steps.map((s) => (
              <div key={s.n} style={{ display: "flex", gap: "1.2vw", alignItems: "flex-start" }}>
                <div style={{ minWidth: "2.8vw", height: "2.8vw", borderRadius: "50%", background: "rgba(212,168,83,0.12)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.3vw", color: "#D4A853", flexShrink: 0, marginTop: "0.2vh" }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontFamily: "Outfit", fontSize: "1.5vw", fontWeight: 700, color: "#E8EAF0", marginBottom: "0.2vh" }}>{s.title}</div>
                  <div style={{ fontFamily: "Inter", fontSize: "1.3vw", color: "#6B7296", lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(107,114,150,0.2)", paddingTop: "1.5vh" }}>
            <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "1.2vh", fontWeight: 600 }}>Key Locations</div>
            <div style={{ display: "flex", gap: "3vw" }}>
              {nav.map((n) => (
                <div key={n.name}>
                  <div style={{ fontFamily: "Outfit", fontSize: "1.5vw", fontWeight: 600, color: "#E8EAF0" }}>{n.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#6B7296" }}>{n.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
