import React from "react";

export default function Slide17TechRoadmap() {
  const tracks = [
    {
      name: "Platform",
      color: "#3b82f6",
      items: [
        { year: "2026", text: "Prospector Phases 1–4" },
        { year: "2027", text: "Memory Vaults v2, Bot Fabrication Studio" },
        { year: "2028", text: "Multi-LLM routing (OpenAI + Anthropic + Gemini)" },
        { year: "2029", text: "Enterprise API suite" },
        { year: "2030", text: "Platform licensing" },
      ]
    },
    {
      name: "Content",
      color: "#f59e0b",
      items: [
        { year: "2026", text: "BingoLingo AEO attribution" },
        { year: "2027", text: "Multilingual content generation" },
        { year: "2028", text: "Video & podcast content types" },
        { year: "2029", text: "Real-time AEO monitoring" },
        { year: "2030", text: "Content OS" },
      ]
    },
    {
      name: "Intelligence",
      color: "#3b82f6",
      items: [
        { year: "2026", text: "Cloud 9 Score v1" },
        { year: "2027", text: "Competitive AEO alerts" },
        { year: "2028", text: "Predictive AEO modeling" },
        { year: "2029", text: "Industry benchmarks" },
        { year: "2030", text: "AEO marketplace" },
      ]
    },
    {
      name: "Mobile",
      color: "#f59e0b",
      items: [
        { year: "2026", text: "Command Center v1" },
        { year: "2027", text: "Governance 2.0 + biometrics" },
        { year: "2028", text: "Offline mode + native widgets" },
        { year: "2029", text: "Partner portal mobile" },
        { year: "2030", text: "Enterprise mobile MDM" },
      ]
    },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 70% 50%, rgba(59,130,246,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4vh 5.5vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Technology Roadmap 2026–2030</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.2vh" }} />
          </div>
          <div style={{ display: "flex", gap: "1vw" }}>
            <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "6px", padding: "0.7vh 1vw" }}>
              <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#3b82f6" }}>Tech Visionary Zara + Build Master Leon</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "8vw repeat(5, 1fr)", gap: "1vh", flex: 1 }}>
          <div />
          {["2026", "2027", "2028", "2029", "2030"].map(y => (
            <div key={y} style={{ textAlign: "center", background: "rgba(59,130,246,0.1)", borderRadius: "6px", padding: "0.8vh 0", fontSize: "1.2vw", fontWeight: 700, color: "#3b82f6", fontFamily: "Space Grotesk" }}>{y}</div>
          ))}

          {tracks.map((track) => (
            <React.Fragment key={track.name}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "1vw" }}>
                <div style={{ writingMode: "horizontal-tb", fontSize: "1.1vw", fontWeight: 700, color: track.color, textAlign: "right" }}>{track.name}</div>
              </div>
              {track.items.map((item) => (
                <div key={track.name + item.year} style={{ background: "rgba(17,24,41,0.9)", border: `1px solid rgba(${track.color === "#3b82f6" ? "59,130,246" : "245,158,11"},0.2)`, borderRadius: "8px", padding: "1.5vh 1.2vw", display: "flex", alignItems: "center" }}>
                  <div style={{ fontSize: "1.05vw", color: "#f0f4ff", lineHeight: 1.4 }}>{item.text}</div>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        <div style={{ marginTop: "1.5vh", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "8px", padding: "1.5vh 2vw" }}>
          <div style={{ fontSize: "1.1vw", color: "#f0f4ff", fontStyle: "italic" }}>
            "We are a multi-LLM platform. We do not bet on one model provider. We route intelligently to get the best result at the lowest cost — always."
            <span style={{ color: "#f59e0b", fontStyle: "normal", fontWeight: 600 }}> — Tech Visionary Zara</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
