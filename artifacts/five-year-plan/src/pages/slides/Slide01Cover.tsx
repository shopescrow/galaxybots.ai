export default function Slide01Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0 stars-bg" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(59,130,246,0.12) 0%, transparent 70%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 40% at 80% 20%, rgba(245,158,11,0.06) 0%, transparent 60%)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: "6vh 8vw" }}>
        <div className="flex items-center gap-3 mb-6">
          <div style={{ width: "3vw", height: "3vw", background: "linear-gradient(135deg, #3b82f6, #f59e0b)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "1.2vw", color: "#fff", fontWeight: 700 }}>GP</span>
          </div>
          <span className="font-display" style={{ fontSize: "1.6vw", fontWeight: 600, color: "#94a3b8", letterSpacing: "0.15em", textTransform: "uppercase" }}>Gifted Productions Inc.</span>
        </div>

        <div style={{ width: "8vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #3b82f6, transparent)", marginBottom: "4vh" }} />

        <h1 className="font-display" style={{ fontSize: "5.5vw", fontWeight: 700, color: "#f0f4ff", textAlign: "center", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
          5-Year Strategic Plan
        </h1>
        <h2 className="font-display" style={{ fontSize: "2.8vw", fontWeight: 700, color: "#3b82f6", textAlign: "center", lineHeight: 1.2, marginBottom: "3vh" }}>
          2026 – 2030
        </h2>

        <div style={{ width: "8vw", height: "0.2vh", background: "linear-gradient(90deg, transparent, #f59e0b, transparent)", marginBottom: "3.5vh" }} />

        <p className="font-display" style={{ fontSize: "2.2vw", fontWeight: 500, color: "#f59e0b", textAlign: "center", fontStyle: "italic", marginBottom: "4vh" }}>
          "Fortune 500 Intelligence. For Everyone."
        </p>

        <div className="flex items-center gap-6">
          <span style={{ fontSize: "1.4vw", color: "#4a5568", fontWeight: 500 }}>March 2026</span>
          <div style={{ width: "0.1vw", height: "2vh", background: "#1a2240" }} />
          <span style={{ fontSize: "1.4vw", color: "#4a5568", fontWeight: 500 }}>Confidential — Board Distribution Only</span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.4vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
