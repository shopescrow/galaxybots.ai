export default function Slide09Prospector() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ marginBottom: "2.5vh" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>AEO Intelligence Engine</span>
              <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw", textAlign: "right" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>Digital Dominic + Closer King Rivera</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "35%" }}>
            <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
              Prospector — The Cloud 9 Score Engine
            </h1>

            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "2.5vh 2vw", marginBottom: "2vh", textAlign: "center" }}>
              <div className="font-display" style={{ fontSize: "4.5vw", fontWeight: 700, color: "#3b82f6", lineHeight: 1 }}>C9</div>
              <div style={{ fontSize: "1.2vw", color: "#94a3b8", marginTop: "0.5vh" }}>Cloud 9 Score™</div>
              <div style={{ fontSize: "1.1vw", color: "#f59e0b", marginTop: "0.5vh" }}>0–100 AI Visibility Index</div>
            </div>

            <div className="quote-panel" style={{ borderRadius: "6px" }}>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "Prospector is how we turn our platform into a growth machine — every company we scan is a warm prospect who doesn't know they need us yet."
              </div>
              <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Closer King Rivera</div>
            </div>
          </div>

          <div style={{ width: "65%", display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "2vh 2vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#3b82f6", marginBottom: "1vh" }}>Cloud 9 Score™ — Measured Across 9 Engines</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8vh" }}>
                {["ChatGPT", "Gemini", "Perplexity", "Bing Copilot", "Claude", "Meta AI", "DeepSeek", "Grok", "Google AI"].map((engine) => (
                  <span key={engine} style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "4px", padding: "0.3vh 0.8vw", fontSize: "1vw", color: "#60a5fa" }}>{engine}</span>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "1.2vh" }}>
              {[
                { label: "Discover", desc: "Find qualified prospects automatically" },
                { label: "Enrich", desc: "Add contact and company data" },
                { label: "Qualify", desc: "Confidence scoring + review queue" },
                { label: "Contact", desc: "Automated outreach sequences" },
                { label: "Convert", desc: "CRM integration + deal tracking" }
              ].map((step, i) => (
                <div key={step.label} style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "1.5vh 1vw", textAlign: "center" }}>
                  <div style={{ fontSize: "0.9vw", fontWeight: 600, color: "#f59e0b", marginBottom: "0.6vh" }}>Step {i + 1}</div>
                  <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.5vh" }}>{step.label}</div>
                  <div style={{ fontSize: "0.95vw", color: "#94a3b8", lineHeight: 1.4 }}>{step.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh" }}>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "1.8vh 1.5vw" }}>
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#3b82f6", marginBottom: "0.8vh" }}>Competitive Intelligence</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Track up to 10 competitors' AI visibility in real-time — know when you're losing ground before the market does</div>
              </div>
              <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "1.8vh 1.5vw" }}>
                <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#3b82f6", marginBottom: "0.8vh" }}>Human Review Queue</div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Confidence scoring flags low-certainty records for human approval — data quality is non-negotiable</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
