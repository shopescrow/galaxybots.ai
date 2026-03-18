export default function Slide09OptimaPrime() {
  const bullets = [
    "Analyzes your objective across all departments",
    "Proposes the right specialists for the task",
    "Suggests new bots where gaps exist",
  ];
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 80% at 85% 50%, rgba(212,168,83,0.08) 0%, transparent 60%)" }} />
      <div className="absolute right-[5vw] top-[10vh]">
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ position: "absolute", borderRadius: "50%", border: `1px solid rgba(212,168,83,${0.06 + i * 0.02})`, width: `${8 + i * 6}vw`, height: `${8 + i * 6}vw`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        ))}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "4vw" }}>⭐</div>
      </div>
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh] justify-center">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Optima Prime</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "3.8vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Optima Prime<br />Assembles Your Team
        </h2>
        <div style={{ fontFamily: "Outfit", fontSize: "3vw", fontWeight: 900, color: "#D4A853", letterSpacing: "-0.01em", marginBottom: "4vh" }}>
          AI Commander
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2vh", maxWidth: "45vw" }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
              <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
              <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#E8EAF0" }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
