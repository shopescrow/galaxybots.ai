export default function Slide14GrowthLevers() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 55% 55% at 75% 50%, rgba(245,158,11,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Growth Levers</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
          </div>
          <div style={{ display: "flex", gap: "1vw" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>Growth Hawk Yusuf + Partner Pro Felix</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "32%" }}>
            <h1 className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
              Four Compounding Growth Engines
            </h1>
            <div className="quote-panel" style={{ borderRadius: "6px" }}>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "Our partners don't sell GalaxyBots. They sell their own AI platform. We are the infrastructure. The best distribution is invisible distribution."
              </div>
              <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Partner Pro Felix</div>
            </div>
          </div>

          <div style={{ width: "68%", display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5vh" }}>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "1.2vh" }}>
                  <div className="font-display" style={{ fontSize: "2.2vw", fontWeight: 700, color: "#3b82f6" }}>01</div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>Partner-Led Channel</div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>White-label agencies become our distribution army. 50% of new ARR from partners by Year 3 — invisible leverage at scale</div>
              </div>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "1.2vh" }}>
                  <div className="font-display" style={{ fontSize: "2.2vw", fontWeight: 700, color: "#f59e0b" }}>02</div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>AEO Category Ownership</div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>We name the category, we own the category. Cloud 9 Score™ becomes the NPS of the AI-answer economy</div>
              </div>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "1.2vh" }}>
                  <div className="font-display" style={{ fontSize: "2.2vw", fontWeight: 700, color: "#3b82f6" }}>03</div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>Credit Expansion Flywheel</div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>ROI from one bot → hire more bots → more credits → higher ACV. Every successful client drives organic expansion</div>
              </div>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "1.2vh" }}>
                  <div className="font-display" style={{ fontSize: "2.2vw", fontWeight: 700, color: "#f59e0b" }}>04</div>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>BingoLingo ↔ Prospector Cross-Sell</div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Content clients need AEO scoring; AEO clients need content. Built-in bidirectional upsell with zero friction</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
