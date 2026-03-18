export default function Slide12Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(212,168,83,0.12) 0%, rgba(61,127,232,0.06) 40%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #D4A853 40%, #D4A853 60%, transparent)" }} />
      <div className="relative flex h-full flex-col items-center justify-center px-[8vw] text-center">
        <div style={{ fontFamily: "Outfit", fontSize: "6vw", fontWeight: 900, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "2vh", lineHeight: 1 }}>
          You're Ready to Lead
        </div>
        <p style={{ fontFamily: "Inter", fontSize: "2vw", color: "#6B7296", marginBottom: "6vh" }}>
          Your AI executive team is standing by
        </p>
        <div style={{ display: "flex", gap: "4vw", marginBottom: "6vh" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5vh" }}>
            <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "rgba(212,168,83,0.10)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "Outfit", fontWeight: 900, fontSize: "2vw", color: "#D4A853" }}>AI</span>
            </div>
            <div style={{ fontFamily: "Outfit", fontSize: "1.6vw", fontWeight: 600, color: "#E8EAF0" }}>Bots</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5vh" }}>
            <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "rgba(212,168,83,0.10)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "Outfit", fontWeight: 900, fontSize: "1.8vw", color: "#D4A853" }}>DT</span>
            </div>
            <div style={{ fontFamily: "Outfit", fontSize: "1.6vw", fontWeight: 600, color: "#E8EAF0" }}>Deploy Team</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5vh" }}>
            <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "rgba(212,168,83,0.10)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "Outfit", fontWeight: 900, fontSize: "1.6vw", color: "#D4A853" }}>CC</span>
            </div>
            <div style={{ fontFamily: "Outfit", fontSize: "1.6vw", fontWeight: 600, color: "#E8EAF0" }}>Command Center</div>
          </div>
        </div>
        <div style={{ width: "8vw", height: "0.25vh", background: "linear-gradient(90deg, transparent, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <div style={{ fontFamily: "Inter", fontSize: "1.6vw", color: "#D4A853", letterSpacing: "0.05em" }}>
          GalaxyBots.ai — Fortune 500 intelligence, at your command
        </div>
      </div>
    </div>
  );
}
