export default function Slide07DeepThinking() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(212,168,83,0.10) 0%, rgba(212,168,83,0.03) 40%, transparent 70%)" }} />
      <div className="absolute inset-0">
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.04)", width: "20vw", height: "20vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.055)", width: "32vw", height: "32vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.07)", width: "44vw", height: "44vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.085)", width: "56vw", height: "56vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.10)", width: "68vw", height: "68vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", borderRadius: "50%", border: "1px solid rgba(212,168,83,0.115)", width: "80vw", height: "80vw", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      </div>
      <div className="relative flex h-full flex-col items-center justify-center px-[10vw] text-center">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: "3vh", background: "rgba(212,168,83,0.1)", border: "1px solid rgba(212,168,83,0.3)", padding: "0.8vh 2vw", borderRadius: "2vw" }}>
          Pro Tip
        </div>
        <h2 style={{ fontFamily: "Outfit", fontSize: "5vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "3vh", lineHeight: 1.05 }}>
          Enable Deep Thinking
          <span style={{ display: "block" }}>for complex analysis</span>
        </h2>
        <div style={{ width: "8vw", height: "0.25vh", background: "linear-gradient(90deg, transparent, #D4A853, transparent)", marginBottom: "3vh" }} />
        <p style={{ fontFamily: "Inter", fontSize: "2vw", color: "#6B7296", maxWidth: "50vw", lineHeight: 1.5 }}>
          10 AI perspectives synthesized in parallel — for strategic decisions that demand depth
        </p>
      </div>
    </div>
  );
}
