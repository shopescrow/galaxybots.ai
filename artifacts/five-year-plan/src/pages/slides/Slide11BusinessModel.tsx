export default function Slide11BusinessModel() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 60% at 80% 40%, rgba(245,158,11,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Business Model</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
          </div>
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw", textAlign: "right" }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>CFO Sentinel Marcus</div>
            <div style={{ fontSize: "1vw", color: "#94a3b8" }}>Finance Director</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "40%" }}>
            <h1 className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
              Four Revenue Levers. Most SaaS Companies Have One.
            </h1>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.4vw", height: "3.5vh", background: "#3b82f6", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.15vw", fontWeight: 600, color: "#f0f4ff" }}>Subscription Tiers</div>
                  <div style={{ fontSize: "1.05vw", color: "#94a3b8" }}>Starter · Pro · Scale</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.4vw", height: "3.5vh", background: "#f59e0b", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.15vw", fontWeight: 600, color: "#f0f4ff" }}>Credit Overages</div>
                  <div style={{ fontSize: "1.05vw", color: "#94a3b8" }}>$0.025 per credit — expansion flywheel</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.4vw", height: "3.5vh", background: "#3b82f6", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.15vw", fontWeight: 600, color: "#f0f4ff" }}>Premium Add-ons</div>
                  <div style={{ fontSize: "1.05vw", color: "#94a3b8" }}>Bot Fabrication · Autonomy · API · Memory Vaults</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.4vw", height: "3.5vh", background: "#f59e0b", borderRadius: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "1.15vw", fontWeight: 600, color: "#f0f4ff" }}>White-Label Wholesale</div>
                  <div style={{ fontSize: "1.05vw", color: "#94a3b8" }}>40–70% margins based on partner volume</div>
                </div>
              </div>
            </div>

            <div className="quote-panel" style={{ borderRadius: "6px", marginTop: "2.5vh" }}>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "We have four revenue levers. Most SaaS companies have one. This is not an accident — it is architecture."
              </div>
              <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— CFO Sentinel Marcus</div>
            </div>
          </div>

          <div style={{ width: "60%", display: "flex", flexDirection: "column", gap: "2vh", }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh", height: "100%", justifyContent: "center" }}>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2vh 2vw" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1vh" }}>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>Starter</div>
                  <div className="font-display" style={{ fontSize: "2vw", fontWeight: 700, color: "#3b82f6" }}>$999<span style={{ fontSize: "1.2vw", fontWeight: 400, color: "#94a3b8" }}>/mo</span></div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>1 AI Director · 100 credits/month · Core features</div>
              </div>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", padding: "2vh 2vw" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1vh" }}>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>Pro</div>
                  <div className="font-display" style={{ fontSize: "2vw", fontWeight: 700, color: "#f59e0b" }}>$4,999<span style={{ fontSize: "1.2vw", fontWeight: 400, color: "#94a3b8" }}>/mo</span></div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>5 Directors · Boardroom · Shared memory · 500 credits/month</div>
              </div>
              <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(245,158,11,0.08))", border: "1px solid rgba(59,130,246,0.4)", borderRadius: "10px", padding: "2vh 2vw" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1vh" }}>
                  <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f0f4ff" }}>Scale</div>
                  <div className="font-display" style={{ fontSize: "2vw", fontWeight: 700, color: "#3b82f6" }}>$9,999<span style={{ fontSize: "1.2vw", fontWeight: 400, color: "#94a3b8" }}>/mo</span></div>
                </div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>All 51 Directors · Full boardroom · Advanced analytics · 2,000 credits/month</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
