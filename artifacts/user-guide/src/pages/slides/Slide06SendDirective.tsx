export default function Slide06SendDirective() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(61,127,232,0.10) 0%, transparent 55%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 5</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Send Your Directive
        </h2>
        <p style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#6B7296", marginBottom: "5vh" }}>
          Be specific. Your bots interpret plain language and take action.
        </p>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "55vw", display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <div style={{ alignSelf: "flex-end", background: "rgba(61,127,232,0.15)", border: "1px solid rgba(61,127,232,0.3)", borderRadius: "1vw 1vw 0.2vw 1vw", padding: "2vh 2.5vw", maxWidth: "40vw" }}>
              <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#6BA3F5", fontWeight: 600, marginBottom: "0.8vh" }}>You</div>
              <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#E8EAF0", lineHeight: 1.4 }}>
                "Analyze our Q2 revenue and flag areas of concern"
              </div>
            </div>
            <div style={{ alignSelf: "flex-start", background: "#0E1029", border: "1px solid rgba(212,168,83,0.2)", borderRadius: "0.2vw 1vw 1vw 1vw", padding: "2vh 2.5vw", maxWidth: "42vw" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
                <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "50%", background: "rgba(212,168,83,0.15)", border: "1px solid rgba(212,168,83,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2vw" }}>💰</div>
                <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", fontWeight: 600 }}>CFO Bot</div>
              </div>
              <div style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#E8EAF0", lineHeight: 1.4 }}>
                Understood. I'm pulling Q2 data now. Initial scan shows margin compression in Operations — down 4.2% vs Q1. Flagging 3 cost centers for your review.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
