export default function Slide04Vision() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0c1328 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
      <div className="absolute" style={{ top: "5vh", right: "5vw", width: "20vw", height: "20vw", background: "radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 70%)", borderRadius: "50%" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "5vh 7vw" }}>
        <div style={{ marginBottom: "3vh" }}>
          <span style={{ fontSize: "1.2vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>The Vision</span>
          <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "6vw", flex: 1 }}>
          <div style={{ flex: 1 }}>
            <h1 className="font-display" style={{ fontSize: "3.8vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
              The World's Largest Fleet of AI Executives
            </h1>
            <p style={{ fontSize: "1.4vw", color: "#94a3b8", lineHeight: 1.65, marginBottom: "3vh" }}>
              51 AI specialists, available 24/7, at 4¢ on the dollar vs. human executive cost.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ width: "0.4vw", height: "4vh", background: "#3b82f6", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Executive Intelligence</div>
                  <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>GalaxyBots.ai — 51 AI Directors across 9 departments</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ width: "0.4vw", height: "4vh", background: "#f59e0b", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Content Intelligence</div>
                  <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>BingoLingo.ai — AEO-optimized content at scale</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ width: "0.4vw", height: "4vh", background: "#3b82f6", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Market Intelligence</div>
                  <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Prospector — Cloud 9 Score AEO Engine</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
                <div style={{ width: "0.4vw", height: "4vh", background: "#f59e0b", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 600, color: "#f0f4ff" }}>Mobile Command</div>
                  <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>GalaxyBots Mobile — executive governance on the go</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ width: "32%", display: "flex", flexDirection: "column", gap: "2vh", justifyContent: "center" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 2vw", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "5vw", fontWeight: 700, color: "#3b82f6", lineHeight: 1 }}>$90M</div>
              <div style={{ fontSize: "1.2vw", color: "#94a3b8", marginTop: "0.8vh" }}>ARR by 2030</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5vh" }}>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "1.8vh 1.2vw", textAlign: "center" }}>
                <div className="font-display" style={{ fontSize: "2.5vw", fontWeight: 700, color: "#f59e0b" }}>3,000</div>
                <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Companies</div>
              </div>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "1.8vh 1.2vw", textAlign: "center" }}>
                <div className="font-display" style={{ fontSize: "2.5vw", fontWeight: 700, color: "#f59e0b" }}>700</div>
                <div style={{ fontSize: "1vw", color: "#94a3b8", marginTop: "0.5vh" }}>Partners</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
