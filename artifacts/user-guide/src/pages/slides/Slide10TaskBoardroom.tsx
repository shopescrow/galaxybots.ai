export default function Slide10TaskBoardroom() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 80% at 0% 50%, rgba(212,168,83,0.05) 0%, transparent 55%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 7</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "4vh" }}>
          Lead Your Task Boardroom
        </h2>
        <div style={{ display: "flex", gap: "6vw", flex: 1 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <p style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 600, color: "#D4A853", fontStyle: "italic" }}>
              "You are the Architect. Your team listens, collaborates, and executes."
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
                <div style={{ fontFamily: "Inter", fontSize: "1.6vw", color: "#E8EAF0" }}>Direct the full team in one space</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
                <div style={{ fontFamily: "Inter", fontSize: "1.6vw", color: "#E8EAF0" }}>Request specialist additions mid-session</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ minWidth: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#D4A853" }} />
                <div style={{ fontFamily: "Inter", fontSize: "1.6vw", color: "#E8EAF0" }}>Track every action in real time</div>
              </div>
            </div>
            <div style={{ marginTop: "auto", fontFamily: "Inter", fontSize: "1.5vw", color: "#3D7FE8", fontWeight: 500 }}>
              → Boardroom in left nav
            </div>
          </div>
          <div style={{ width: "32vw", background: "#0E1029", border: "1px solid rgba(212,168,83,0.2)", borderRadius: "1.2vw", padding: "2.5vh 2vw", display: "flex", flexDirection: "column", gap: "1.5vh", flexShrink: 0 }}>
            <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#6B7296", textTransform: "uppercase", letterSpacing: "0.15em", borderBottom: "1px solid rgba(107,114,150,0.2)", paddingBottom: "1vh" }}>Task Boardroom</div>
            <div style={{ alignSelf: "flex-end", background: "rgba(61,127,232,0.12)", border: "1px solid rgba(61,127,232,0.25)", borderRadius: "0.8vw", padding: "1.2vh 1.5vw", maxWidth: "26vw" }}>
              <div style={{ fontFamily: "Inter", fontSize: "1.1vw", color: "#6BA3F5", fontWeight: 600, marginBottom: "0.4vh" }}>You</div>
              <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#E8EAF0", lineHeight: 1.4 }}>Team, I need a full competitive analysis by EOD.</div>
            </div>
            <div style={{ alignSelf: "flex-start", background: "rgba(107,114,150,0.08)", border: "1px solid rgba(107,114,150,0.2)", borderRadius: "0.8vw", padding: "1.2vh 1.5vw", maxWidth: "26vw" }}>
              <div style={{ fontFamily: "Inter", fontSize: "1.1vw", color: "#D4A853", fontWeight: 600, marginBottom: "0.4vh" }}>CMO Bot</div>
              <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#E8EAF0", lineHeight: 1.4 }}>On it. Pulling competitor AEO scores now.</div>
            </div>
            <div style={{ alignSelf: "flex-start", background: "rgba(107,114,150,0.08)", border: "1px solid rgba(107,114,150,0.2)", borderRadius: "0.8vw", padding: "1.2vh 1.5vw", maxWidth: "26vw" }}>
              <div style={{ fontFamily: "Inter", fontSize: "1.1vw", color: "#D4A853", fontWeight: 600, marginBottom: "0.4vh" }}>CFO Bot</div>
              <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#E8EAF0", lineHeight: 1.4 }}>I'll cross-reference against their funding history.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
