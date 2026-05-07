export default function Slide23Credits() {
  const actions = [
    { label: "Chat with an AI Director", credits: 1, icon: "💬", color: "#3b82f6" },
    { label: "Generate BingoLingo Content", credits: 5, icon: "✍️", color: "#f59e0b" },
    { label: "Run a Background Mission", credits: 5, icon: "🚀", color: "#3b82f6" },
    { label: "Cloud 9 Score Scan", credits: 3, icon: "📊", color: "#f59e0b" },
    { label: "Competitive AEO Analysis", credits: 8, icon: "🔍", color: "#3b82f6" },
    { label: "Virtual Boardroom Session", credits: 10, icon: "🏛️", color: "#f59e0b" },
    { label: "Bot Fabrication (custom bot)", credits: 20, icon: "⚙️", color: "#3b82f6" },
    { label: "Generate ROI Report", credits: 2, icon: "📈", color: "#f59e0b" },
  ];

  const tiers = [
    { name: "Starter", price: "$999", credits: 100, color: "#3b82f6", border: "rgba(59,130,246,0.35)" },
    { name: "Pro", price: "$4,999", credits: 500, color: "#f59e0b", border: "rgba(245,158,11,0.35)" },
    { name: "Scale", price: "$9,999", credits: 2000, color: "#3b82f6", border: "rgba(59,130,246,0.35)" },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0e1a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 40% at 90% 10%, rgba(245,158,11,0.05) 0%, transparent 60%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "2.8vh 5vw 2vh" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Platform Currency</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1vh" }} />
            <h1 className="font-display" style={{ fontSize: "2.8vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginTop: "0.8vh" }}>
              How Credits Work
            </h1>
          </div>

          {/* Hero Credit Value */}
          <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(245,158,11,0.1))", border: "1px solid rgba(245,158,11,0.4)", borderRadius: "12px", padding: "1.5vh 2.5vw", textAlign: "center" }}>
            <div style={{ fontSize: "0.95vw", color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.3vh" }}>1 Credit =</div>
            <div className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f59e0b", lineHeight: 1 }}>$0.025</div>
            <div style={{ fontSize: "0.95vw", color: "#94a3b8", marginTop: "0.3vh" }}>when purchased as overage</div>
            <div style={{ width: "100%", height: "1px", background: "rgba(245,158,11,0.2)", margin: "0.7vh 0" }} />
            <div style={{ fontSize: "0.9vw", color: "#3b82f6" }}>40 credits = $1.00</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "3vw", flex: 1, minHeight: 0 }}>

          {/* Left — What is a credit + tier allocations */}
          <div style={{ width: "30%", display: "flex", flexDirection: "column", gap: "1.3vh" }}>

            {/* What is a Credit */}
            <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "1.5vh 1.8vw" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6", marginBottom: "0.7vh" }}>What Is a Credit?</div>
              <div style={{ fontSize: "1.05vw", color: "#94a3b8", lineHeight: 1.55 }}>
                A credit is one unit of AI compute. Every time your AI executive team performs a task — answering a question, generating content, running a scan — credits are consumed. Think of them as the fuel your AI team runs on.
              </div>
            </div>

            {/* Tier Allocations */}
            <div style={{ fontSize: "0.95vw", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Monthly Credit Allocation</div>
            {tiers.map((tier) => (
              <div key={tier.name} style={{ background: "rgba(17,24,41,0.9)", border: `1px solid ${tier.border}`, borderRadius: "10px", padding: "1.2vh 1.8vw" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6vh" }}>
                  <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f0f4ff" }}>{tier.name}</div>
                  <div className="font-display" style={{ fontSize: "1.25vw", fontWeight: 700, color: tier.color }}>{tier.price}<span style={{ fontSize: "0.85vw", fontWeight: 400, color: "#94a3b8" }}>/mo</span></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                  <div style={{ flex: 1, height: "0.5vh", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(tier.credits / 2000) * 100}%`, background: tier.color, borderRadius: "3px" }} />
                  </div>
                  <div className="font-display" style={{ fontSize: "1.1vw", fontWeight: 700, color: tier.color, minWidth: "4.5vw", textAlign: "right" }}>
                    {tier.credits.toLocaleString()} <span style={{ fontSize: "0.8vw", fontWeight: 400, color: "#94a3b8" }}>credits</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Overage note */}
            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "1vh 1.5vw" }}>
              <div style={{ fontSize: "1vw", color: "#f59e0b", fontWeight: 600, marginBottom: "0.3vh" }}>Need more? No problem.</div>
              <div style={{ fontSize: "0.95vw", color: "#94a3b8", lineHeight: 1.45 }}>Additional credits purchased at <span style={{ color: "#f0f4ff", fontWeight: 600 }}>$0.025 each</span> — no tier upgrade required.</div>
            </div>
          </div>

          {/* Right — Action Cost Grid */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.2vh" }}>
            <div style={{ fontSize: "0.95vw", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Credits Per Action</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2vh", flex: 1 }}>
              {actions.map((action) => (
                <div key={action.label} style={{ background: "rgba(17,24,41,0.9)", border: `1px solid rgba(${action.color === "#3b82f6" ? "59,130,246" : "245,158,11"},0.2)`, borderRadius: "10px", padding: "1.4vh 1.5vw", display: "flex", alignItems: "center", gap: "1vw" }}>
                  <div style={{ fontSize: "1.6vw", lineHeight: 1, flexShrink: 0 }}>{action.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "1vw", fontWeight: 600, color: "#f0f4ff", lineHeight: 1.3, marginBottom: "0.4vh" }}>{action.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.4vw" }}>
                      <span className="font-display" style={{ fontSize: "1.6vw", fontWeight: 700, color: action.color, lineHeight: 1 }}>{action.credits}</span>
                      <span style={{ fontSize: "0.9vw", color: "#94a3b8" }}>credit{action.credits !== 1 ? "s" : ""}</span>
                      <span style={{ fontSize: "0.85vw", color: "#4a5568", marginLeft: "0.2vw" }}>≈ ${(action.credits * 0.025).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Expansion Flywheel callout */}
            <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(245,158,11,0.07))", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "1.4vh 2vw", display: "flex", alignItems: "center", gap: "1.5vw" }}>
              <div style={{ fontSize: "1.8vw", flexShrink: 0 }}>🔄</div>
              <div>
                <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.3vh" }}>The Credit Expansion Flywheel</div>
                <div style={{ fontSize: "1vw", color: "#94a3b8", lineHeight: 1.45 }}>
                  Clients who see ROI from one Director activate more Directors — consuming more credits. Higher consumption signals success and drives plan upgrades. <span style={{ color: "#f59e0b", fontWeight: 600 }}>Credits are our NRR growth engine.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
