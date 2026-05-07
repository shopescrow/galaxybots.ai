export default function Slide13QuickStart() {
  const steps = [
    { num: "1", label: "Log In", detail: "Navigate to your GalaxyBots URL and enter your credentials.", loc: "Login page" },
    { num: "2", label: "Check Command Center", detail: "Review Activity Feed, Pending Approvals, and Company Status.", loc: "Command Center" },
    { num: "3", label: "Explore Your Bots", detail: "Visit Bots in the left nav to browse your full roster of AI executives.", loc: "Bots (left nav)" },
    { num: "4", label: "Open a Channel", detail: "Select a specialist and click Open Channel for a direct line.", loc: "Bots → Open Channel" },
    { num: "5", label: "Send Your Directive", detail: "Use plain language — your bots act immediately.", loc: "Channel window" },
    { num: "6", label: "Deploy a Team", detail: "Use Deploy Team for complex goals that need multiple specialists.", loc: "Deploy Team" },
    { num: "7", label: "Lead the Boardroom", detail: "Assign, redirect, and track your full team in one shared space.", loc: "Task Boardroom" },
    { num: "8", label: "Manage Approvals", detail: "Review and approve bot actions before they execute.", loc: "Pending Approvals" },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(139,92,246,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4vh 5vw" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3vh" }}>
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.8vh" }}>Quick Start Reference Card</div>
            <h1 className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              8 Steps to Your First Mission
            </h1>
          </div>
          <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", padding: "1.5vh 2vw", textAlign: "right" }}>
            <div style={{ fontSize: "1vw", color: "#94a3b8", marginBottom: "0.5vh" }}>GalaxyBots.ai</div>
            <div style={{ fontSize: "1vw", color: "#8b5cf6", fontWeight: 600 }}>Fortune 500 intelligence, at your command</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5vh 3vw", flex: 1 }}>
          {steps.map(({ num, label, detail, loc }) => (
            <div key={num} style={{ display: "flex", alignItems: "flex-start", gap: "1.2vw", background: "rgba(17,24,41,0.8)", border: "1px solid rgba(26,34,64,0.8)", borderRadius: "8px", padding: "1.5vh 1.5vw" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", background: "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(59,130,246,0.3))", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f0f4ff" }}>{num}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4vh" }}>
                  <span style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f0f4ff" }}>{label}</span>
                  <span style={{ fontSize: "0.85vw", color: "#8b5cf6", background: "rgba(139,92,246,0.12)", borderRadius: "3px", padding: "0.1vh 0.6vw", whiteSpace: "nowrap" }}>{loc}</span>
                </div>
                <div style={{ fontSize: "1vw", color: "#94a3b8", lineHeight: 1.4 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "2vh" }}>
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "8px", padding: "1.5vh 2vw" }}>
            <div style={{ fontSize: "1vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.08em" }}>Key Locations</div>
            <div style={{ display: "flex", gap: "3vw" }}>
              {["Command Center", "Bots", "Deploy Team", "Task Boardroom", "Pending Approvals"].map((loc) => (
                <div key={loc} style={{ display: "flex", alignItems: "center", gap: "0.6vw" }}>
                  <span style={{ color: "#8b5cf6", fontSize: "0.9vw" }}>◆</span>
                  <span style={{ fontSize: "1vw", color: "#cbd5e1", fontWeight: 500 }}>{loc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981, #f59e0b)" }} />
    </div>
  );
}
