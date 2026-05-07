export default function Slide08BingoLingo() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(150deg, #0a0e1a 0%, #0c1225 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 70% 30%, rgba(245,158,11,0.06) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ width: "36%", paddingRight: "3.5vw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#f59e0b", letterSpacing: "0.12em", textTransform: "uppercase" }}>Content Intelligence</span>
            <div style={{ width: "5vw", height: "0.2vh", background: "linear-gradient(90deg, #f59e0b, transparent)", marginTop: "1.5vh", marginBottom: "2vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
              BingoLingo.ai
            </h1>
            <p style={{ fontSize: "1.25vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2vh" }}>
              AI-generated content that gets cited by the AI engines that now answer the world's questions.
            </p>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "1.2vh 1.2vw", marginBottom: "1.5vh" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b" }}>Brand Maven Priya</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>Director of Marketing</div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "BingoLingo doesn't just create content. It creates citations. In the AI-answer economy, citations are the new page-one rankings."
            </div>
            <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Brand Maven Priya</div>
          </div>
        </div>

        <div style={{ width: "64%", display: "flex", flexDirection: "column", gap: "2vh" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh", height: "100%" }}>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1vh" }}>Content Types</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>Blogs · LinkedIn articles · Twitter threads · Email newsletters · Press releases · Case studies</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1vh" }}>AEO Scoring</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>Every piece of content scored against 9 AI engines before AND after publication — measurable impact</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1vh" }}>Content Hub</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>Co-branded public pages for clients — showcase thought leadership and earn AI citations at scale</div>
            </div>
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "2vh 1.8vw" }}>
              <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1vh" }}>Attribution Loop</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>Links content output directly to Cloud 9 Score improvement — proves ROI in every client report</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(59,130,246,0.05))", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "2vh 1.8vw", gridColumn: "span 2" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.8vh" }}>The Built-In Cross-Sell Path</div>
              <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>BingoLingo content clients naturally need AEO scoring → Prospector clients need content → built-in upsell loop with zero additional sales effort</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
