export default function Slide19Risk() {
  const risks = [
    {
      id: "01",
      risk: "LLM Commoditization",
      mitigation: "Multi-LLM routing — moat is Memory + Personas, not the model itself. We are model-agnostic by design.",
      owner: "Tech Visionary Zara",
      color: "#3b82f6",
    },
    {
      id: "02",
      risk: "Regulatory Shifts in AI",
      mitigation: "General Counsel Alexis leads proactive compliance. SOC 2 + GDPR roadmap already scoped and sequenced.",
      owner: "General Counsel Alexis",
      color: "#f59e0b",
    },
    {
      id: "03",
      risk: "Partner Channel Concentration",
      mitigation: "No single partner exceeds 15% of ARR. Diversify across 300+ partners by Year 4 — portfolio model.",
      owner: "Partner Pro Felix",
      color: "#3b82f6",
    },
    {
      id: "04",
      risk: "Data Breaches",
      mitigation: "CISO Nova leads zero-trust architecture, encryption-at-rest, and quarterly penetration tests from Day 1.",
      owner: "CISO Sentinel Nova",
      color: "#f59e0b",
    },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 80% 50%, rgba(59,130,246,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Risk Register</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
          </div>
          <div style={{ display: "flex", gap: "1vw" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw" }}>
              <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#f59e0b" }}>Risk Warden Okafor + CISO Sentinel Nova</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "30%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <h1 className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
                Every Risk Has a Named Owner
              </h1>
              <p style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.65, marginBottom: "2vh" }}>
                That is not bureaucracy — that is accountability. Risk ownership is not assigned after incidents; it is defined before them.
              </p>
            </div>
            <div className="quote-panel" style={{ borderRadius: "6px" }}>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "Every risk on this list has a named owner. That is not bureaucracy — that is accountability."
              </div>
              <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Risk Warden Okafor</div>
            </div>
          </div>

          <div style={{ width: "70%", display: "flex", flexDirection: "column", gap: "2vh", }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2vh", height: "100%", justifyContent: "center" }}>
              {risks.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: "2vw", background: "rgba(17,24,41,0.9)", border: `1px solid rgba(${r.color === "#3b82f6" ? "59,130,246" : "245,158,11"},0.2)`, borderRadius: "10px", padding: "2vh 2vw", alignItems: "flex-start" }}>
                  <div className="font-display" style={{ fontSize: "2.5vw", fontWeight: 700, color: r.color, minWidth: "3.5vw" }}>{r.id}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.6vh" }}>{r.risk}</div>
                    <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5, marginBottom: "0.6vh" }}>{r.mitigation}</div>
                    <div style={{ fontSize: "1vw", color: r.color, fontWeight: 600 }}>Owner: {r.owner}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
