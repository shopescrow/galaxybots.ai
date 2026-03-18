export default function Slide09OptimaPrime() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 80% at 85% 50%, rgba(212,168,83,0.08) 0%, transparent 60%)" }} />
      <div className="absolute" style={{ right: "5vw", top: "10vh" }}>
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.06)", width: "8vw", height: "8vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.08)", width: "14vw", height: "14vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.10)", width: "20vw", height: "20vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.12)", width: "26vw", height: "26vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.14)", width: "32vw", height: "32vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "3.5vw",
            height: "3.5vw",
            background: "#D4A853",
            clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
          }}
        />
      </div>
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh] justify-center">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Optima Prime</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "3.8vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Optima Prime
          <span style={{ display: "block" }}>Assembles Your Team</span>
        </h2>
        <div style={{ fontFamily: "Outfit", fontSize: "3vw", fontWeight: 900, color: "#D4A853", letterSpacing: "-0.01em", marginBottom: "4vh" }}>
          AI Commander
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2vh", maxWidth: "45vw" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
            <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#E8EAF0" }}>Analyzes your objective across all departments</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
            <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#E8EAF0" }}>Proposes the right specialists for the task</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
            <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#E8EAF0" }}>Suggests new bots where gaps exist</div>
          </div>
        </div>
      </div>
    </div>
  );
}
