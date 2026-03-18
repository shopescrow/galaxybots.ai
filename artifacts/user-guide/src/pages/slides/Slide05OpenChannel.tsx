export default function Slide05OpenChannel() {
  const steps = [
    "Navigate to Bots in the left sidebar",
    "Select the specialist you need",
    "Click \"Open Channel\"",
    "Your secure line is live",
  ];
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 80% at 100% 50%, rgba(61,127,232,0.08) 0%, transparent 55%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 4</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "4vh" }}>
          Open a Channel
        </h2>
        <div style={{ display: "flex", gap: "8vw", flex: 1, alignItems: "flex-start" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: "2vw", alignItems: "center" }}>
                <div style={{ minWidth: "3.5vw", height: "3.5vw", borderRadius: "50%", background: i < 3 ? "rgba(212,168,83,0.15)" : "rgba(61,127,232,0.2)", border: `1px solid ${i < 3 ? "rgba(212,168,83,0.4)" : "rgba(61,127,232,0.5)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.5vw", color: i < 3 ? "#D4A853" : "#3D7FE8" }}>
                  {i + 1}
                </div>
                <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: i === 3 ? "#E8EAF0" : "#E8EAF0", fontWeight: i === 3 ? 500 : 400 }}>{step}</div>
              </div>
            ))}
            <div style={{ marginTop: "2vh", fontFamily: "Inter", fontSize: "1.5vw", color: "#3D7FE8", fontWeight: 500 }}>
              → Bots → [Bot Name] → Open Channel
            </div>
          </div>
          <div style={{ width: "28vw", background: "#0E1029", border: "1px solid rgba(212,168,83,0.2)", borderRadius: "1.2vw", padding: "3vh 2.5vw", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5vw", marginBottom: "2.5vh" }}>
              <div style={{ width: "5vw", height: "5vw", borderRadius: "50%", background: "rgba(212,168,83,0.12)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2vw" }}>🎯</div>
              <div>
                <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 700, color: "#E8EAF0" }}>CMO Bot</div>
                <div style={{ fontFamily: "Inter", fontSize: "1.3vw", color: "#6B7296" }}>Growth Department</div>
              </div>
            </div>
            <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#6B7296", marginBottom: "2.5vh", lineHeight: 1.5 }}>
              Go-to-market strategy, lead generation, Prospector pipeline, and growth analysis.
            </div>
            <div style={{ background: "linear-gradient(135deg, #D4A853, #E8C97A)", borderRadius: "0.5vw", padding: "1.2vh 0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.5vw", color: "#08091A" }}>
              Open Channel
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
