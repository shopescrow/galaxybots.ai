export default function Slide08DeployTeam() {
  const nodes = [
    { label: "Define Objective", sub: "What do you need accomplished?", color: "#D4A853", bg: "rgba(212,168,83,0.12)" },
    { label: "Optima Prime Analysis", sub: "AI Commander assembles your team", color: "#3D7FE8", bg: "rgba(61,127,232,0.12)" },
    { label: "Team Assembly", sub: "Right specialists, selected", color: "#D4A853", bg: "rgba(212,168,83,0.12)" },
    { label: "Launch Task Room", sub: "All bots, one space, one goal", color: "#3D7FE8", bg: "rgba(61,127,232,0.12)" },
  ];
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(61,127,232,0.08) 0%, transparent 60%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 6</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Deploy a Team for Big Goals
        </h2>
        <p style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#6B7296", marginBottom: "5vh" }}>
          Use Deploy Team when one bot isn't enough
        </p>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0", width: "100%" }}>
            {nodes.map((node, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{ flex: 1, background: node.bg, border: `1px solid ${node.color}40`, borderRadius: "1vw", padding: "2.5vh 1.5vw", textAlign: "center" }}>
                  <div style={{ fontFamily: "Outfit", fontSize: "1.7vw", fontWeight: 700, color: node.color, marginBottom: "0.8vh" }}>{node.label}</div>
                  <div style={{ fontFamily: "Inter", fontSize: "1.3vw", color: "#6B7296" }}>{node.sub}</div>
                </div>
                {i < nodes.length - 1 && (
                  <div style={{ display: "flex", alignItems: "center", padding: "0 0.8vw" }}>
                    <div style={{ width: "3vw", height: "2px", background: "linear-gradient(90deg, #D4A853, #3D7FE8)" }} />
                    <div style={{ width: 0, height: 0, borderTop: "0.6vh solid transparent", borderBottom: "0.6vh solid transparent", borderLeft: "1vw solid #3D7FE8" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: "2.5vh", fontFamily: "Inter", fontSize: "1.5vw", color: "#3D7FE8", fontWeight: 500 }}>
          → Deploy Team in the left nav
        </div>
      </div>
    </div>
  );
}
