export default function Slide22Contact() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1530 60%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: "6vh 10vw" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5vw", marginBottom: "3vh" }}>
          <div style={{ width: "4vw", height: "4vw", background: "linear-gradient(135deg, #3b82f6, #f59e0b)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "1.6vw", color: "#fff", fontWeight: 700, fontFamily: "Space Grotesk" }}>GP</span>
          </div>
          <div>
            <div className="font-display" style={{ fontSize: "2.5vw", fontWeight: 700, color: "#f0f4ff" }}>Gifted Productions Inc.</div>
            <div style={{ fontSize: "1.3vw", color: "#94a3b8" }}>Executive Intelligence for Every Company</div>
          </div>
        </div>

        <div style={{ width: "8vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #f59e0b, transparent)", marginBottom: "3vh" }} />

        <div style={{ display: "flex", gap: "3vw", marginBottom: "4vh" }}>
          <div style={{ textAlign: "center", background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "2.5vh 3vw" }}>
            <div style={{ fontSize: "1vw", color: "#94a3b8", marginBottom: "0.5vh", letterSpacing: "0.1em", textTransform: "uppercase" }}>Platform</div>
            <div className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: "#3b82f6" }}>GalaxyBots.ai</div>
          </div>
          <div style={{ textAlign: "center", background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "2.5vh 3vw" }}>
            <div style={{ fontSize: "1vw", color: "#94a3b8", marginBottom: "0.5vh", letterSpacing: "0.1em", textTransform: "uppercase" }}>Content</div>
            <div className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: "#f59e0b" }}>BingoLingo.ai</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "2vw", marginBottom: "4vh" }}>
          <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", padding: "1.5vh 2vw", textAlign: "center" }}>
            <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Schedule a Commander Briefing</div>
          </div>
          <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "1.5vh 2vw", textAlign: "center" }}>
            <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Become a White-Label Partner</div>
          </div>
          <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", padding: "1.5vh 2vw", textAlign: "center" }}>
            <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Start Your Free Board Session</div>
          </div>
        </div>

        <div style={{ width: "8vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #3b82f6, transparent)", marginBottom: "3vh" }} />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.2vw", color: "#4a5568", fontStyle: "italic" }}>
            This document is confidential and intended solely for the Gifted Productions Inc. Board of Directors and authorized personnel.
          </div>
          <div style={{ fontSize: "1.1vw", color: "#4a5568", marginTop: "1vh" }}>
            Gifted Productions Inc. © 2026. All rights reserved. Unauthorized disclosure is strictly prohibited.
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
