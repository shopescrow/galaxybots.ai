export default function Slide02Chairman() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1530 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div className="flex flex-col justify-between" style={{ width: "38%", paddingRight: "4vw" }}>
          <div>
            <div style={{ marginBottom: "2vh" }}>
              <span style={{ fontSize: "1.2vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Opening Address</span>
            </div>
            <div className="gold-rule" style={{ width: "5vw", marginBottom: "2.5vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.8vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "3vh" }}>
              Chairman's Statement
            </h1>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "2vh 1.5vw", marginBottom: "3vh" }}>
              <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#f59e0b", marginBottom: "0.5vh" }}>Chairman Atlas</div>
              <div style={{ fontSize: "1.2vw", color: "#94a3b8", fontWeight: 500 }}>Chairperson, Board of Directors</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "1.3vw", color: "#94a3b8", lineHeight: 1.7 }}>
              Sets the tone for the entire 5-year journey — bold, category-defining ambition backed by board consensus.
            </div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "3vh" }}>
          <div className="quote-panel" style={{ borderRadius: "8px" }}>
            <div style={{ fontSize: "1.6vw", color: "#f0f4ff", lineHeight: 1.7, fontStyle: "italic", fontWeight: 400 }}>
              "This plan is not a forecast. It is a declaration. We are building the operating system for the next generation of business — one where every company, regardless of size, commands Fortune 500-grade intelligence."
            </div>
            <div style={{ marginTop: "2vh", fontSize: "1.2vw", color: "#f59e0b", fontWeight: 600 }}>— Chairman Atlas</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh" }}>
            <div className="stat-card">
              <div style={{ fontSize: "1.2vw", color: "#3b82f6", fontWeight: 600, marginBottom: "0.8vh" }}>Category Creation</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>This is not incremental growth — it is a new market category being built from the ground up</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: "1.2vw", color: "#3b82f6", fontWeight: 600, marginBottom: "0.8vh" }}>Board Unanimity</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>Every director has reviewed, challenged, and formally endorsed every element of this plan</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
