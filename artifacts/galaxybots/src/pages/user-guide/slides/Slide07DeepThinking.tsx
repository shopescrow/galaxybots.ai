export default function Slide07DeepThinking() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(139,92,246,0.18) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: "6vh 8vw" }}>
        <div style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: "8px", padding: "0.8vh 2vw", marginBottom: "2vh" }}>
          <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Pro Tip</span>
        </div>

        <h1 className="font-display" style={{ fontSize: "4.5vw", fontWeight: 700, color: "#f0f4ff", textAlign: "center", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Enable Deep Thinking Mode
        </h1>
        <p style={{ fontSize: "1.5vw", color: "#94a3b8", textAlign: "center", marginBottom: "4vh" }}>
          For complex, strategic analysis — activate before you send your directive.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "4vw", marginBottom: "4vh" }}>
          <div style={{ textAlign: "center" }}>
            <div className="font-display" style={{ fontSize: "5vw", fontWeight: 700, color: "#8b5cf6" }}>10</div>
            <div style={{ fontSize: "1.2vw", color: "#94a3b8" }}>AI perspectives</div>
            <div style={{ fontSize: "1.1vw", color: "#4a5568" }}>synthesized in parallel</div>
          </div>
          <div style={{ fontSize: "3vw", color: "#1a2240" }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div className="font-display" style={{ fontSize: "5vw", fontWeight: 700, color: "#3b82f6" }}>1</div>
            <div style={{ fontSize: "1.2vw", color: "#94a3b8" }}>consolidated answer</div>
            <div style={{ fontSize: "1.1vw", color: "#4a5568" }}>with depth and confidence</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vw", width: "80vw", marginBottom: "3vh" }}>
          <div className="stat-card" style={{ padding: "2vh 1.5vw", borderColor: "rgba(139,92,246,0.3)" }}>
            <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "1vh" }}>When to Use Deep Thinking</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
              {["Market entry analysis", "Risk assessment", "Competitive strategy", "High-stakes decisions"].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
                  <span style={{ color: "#8b5cf6", fontSize: "1.1vw" }}>◆</span>
                  <span style={{ fontSize: "1.1vw", color: "#94a3b8" }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="stat-card" style={{ padding: "2vh 1.5vw", borderColor: "rgba(59,130,246,0.3)" }}>
            <div style={{ fontSize: "1.2vw", color: "#3b82f6", fontWeight: 700, marginBottom: "1vh" }}>How It Works</div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.7 }}>
              Your bot examines your question from multiple angles simultaneously — different models, frameworks, and perspectives — before delivering one authoritative, consolidated response.
            </div>
          </div>
        </div>

        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "8px", padding: "2vh 3vw", textAlign: "center" }}>
          <p style={{ fontSize: "1.3vw", color: "#cbd5e1", fontStyle: "italic" }}>
            "Enable it whenever the stakes are high and the answer needs to be right."
          </p>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #8b5cf6)" }} />
    </div>
  );
}
