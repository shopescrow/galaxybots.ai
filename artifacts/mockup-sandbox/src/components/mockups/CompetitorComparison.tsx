export default function CompetitorComparison() {
  const competitors = [
    {
      name: "Relevance AI",
      tagline: "Build Your AI Workforce",
      color: "#3b82f6",
      glow: "rgba(59,130,246,0.3)",
      border: "rgba(59,130,246,0.5)",
      tiers: [
        { name: "Free", price: "$0", note: "200 actions, 1 user" },
        { name: "Pro", price: "$19", note: "10K credits, 2 users" },
        { name: "Team", price: "$199", note: "100K credits, 10 users" },
        { name: "Business", price: "$599", note: "300K credits, CSM" },
        { name: "Enterprise", price: "Custom", note: "" },
      ],
    },
    {
      name: "Lindy AI",
      tagline: "AI Employees",
      color: "#06b6d4",
      glow: "rgba(6,182,212,0.3)",
      border: "rgba(6,182,212,0.5)",
      tiers: [
        { name: "Free", price: "$0", note: "400 credits, 40 tasks" },
        { name: "Starter", price: "$19.99", note: "2,000 credits" },
        { name: "Pro", price: "$49.99", note: "5K credits, unlimited agents" },
        { name: "Business", price: "$299.99", note: "30K+ credits, phone" },
        { name: "Enterprise", price: "Custom", note: "" },
      ],
    },
    {
      name: "AgentGPT",
      tagline: "Autonomous AI Agents",
      color: "#10b981",
      glow: "rgba(16,185,129,0.3)",
      border: "rgba(16,185,129,0.5)",
      tiers: [
        { name: "Free", price: "$0", note: "GPT-3.5, limited" },
        { name: "Pro", price: "$40", note: "30 agents, GPT-4" },
        { name: "Enterprise", price: "Custom", note: "SSO, SLA" },
      ],
    },
    {
      name: "GalaxyBots",
      tagline: "Your AI Executive Team",
      color: "#a855f7",
      glow: "rgba(168,85,247,0.4)",
      border: "rgba(168,85,247,0.8)",
      highlight: true,
      tiers: [
        { name: "Starter", price: "$999", note: "51 AI Directors, governance" },
        { name: "Pro", price: "$4,999", note: "Full roster, AEO, mobile" },
        { name: "Scale", price: "$9,999", note: "White-label, unlimited, reseller" },
      ],
    },
  ];

  const features = [
    { name: "AI Directors / Agents", values: ["Basic agents", "Unlimited agents (Pro)", "30 agents max", "51 AI Directors"] },
    { name: "Voice Per Agent", values: [false, false, false, true] },
    { name: "Custom Avatars", values: [false, false, false, true] },
    { name: "Persistent Memory", values: ["Limited", "Limited", false, true] },
    { name: "MCP Server", values: [false, false, false, true] },
    { name: "Mobile App", values: [false, false, false, true] },
    { name: "Multi-Director Boardroom", values: [false, false, false, true] },
    { name: "Governance & HITL", values: [false, false, false, true] },
    { name: "Phone / Receptionist", values: [false, "Add-on", false, true] },
    { name: "AEO Tools", values: [false, false, false, true] },
    { name: "White-Label", values: [false, false, false, true] },
    { name: "Standing Orders", values: ["Scheduled runs", false, false, true] },
    { name: "Free Trial", values: [true, true, true, false] },
  ];

  function renderValue(val: boolean | string) {
    if (val === true) {
      return (
        <span style={{ color: "#22c55e", fontSize: 18, fontWeight: 700 }}>✓</span>
      );
    }
    if (val === false) {
      return (
        <span style={{ color: "#ef4444", fontSize: 15, fontWeight: 700, opacity: 0.7 }}>✗</span>
      );
    }
    return (
      <span style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.2 }}>{val}</span>
    );
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0a0a1a 0%, #0d0d2b 50%, #0a0a1a 100%)",
        minHeight: "100vh",
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
        color: "#e2e8f0",
        padding: "28px 24px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow background */}
      <div
        style={{
          position: "absolute",
          top: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 800,
          height: 400,
          background: "radial-gradient(ellipse, rgba(168,85,247,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -100,
          right: -100,
          width: 500,
          height: 500,
          background: "radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28, position: "relative" }}>
        <div
          style={{
            display: "inline-block",
            background: "rgba(168,85,247,0.15)",
            border: "1px solid rgba(168,85,247,0.3)",
            borderRadius: 20,
            padding: "4px 16px",
            fontSize: 11,
            fontWeight: 600,
            color: "#c084fc",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Competitive Analysis · March 2026
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: "0 0 6px",
            background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #38bdf8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.02em",
          }}
        >
          GalaxyBots vs. The Competition
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            margin: 0,
            fontWeight: 400,
          }}
        >
          AI agent platforms compared — pricing, features, and what only GalaxyBots delivers
        </p>
      </div>

      {/* Pricing Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
          position: "relative",
        }}
      >
        {competitors.map((comp) => (
          <div
            key={comp.name}
            style={{
              background: comp.highlight
                ? "linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(129,140,248,0.08) 100%)"
                : "rgba(15,15,35,0.8)",
              border: `1.5px solid ${comp.border}`,
              borderRadius: 14,
              padding: "16px 14px",
              position: "relative",
              boxShadow: comp.highlight
                ? `0 0 30px ${comp.glow}, 0 4px 20px rgba(0,0,0,0.5)`
                : `0 2px 12px rgba(0,0,0,0.4)`,
              transition: "transform 0.2s ease",
            }}
          >
            {comp.highlight && (
              <div
                style={{
                  position: "absolute",
                  top: -1,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "linear-gradient(90deg, #a855f7, #818cf8)",
                  borderRadius: "0 0 8px 8px",
                  padding: "2px 12px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                ★ Most Complete
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                marginTop: comp.highlight ? 8 : 0,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: comp.color,
                  boxShadow: `0 0 8px ${comp.glow}`,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: comp.highlight ? "#c084fc" : "#e2e8f0",
                    lineHeight: 1.2,
                  }}
                >
                  {comp.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    fontStyle: "italic",
                  }}
                >
                  "{comp.tagline}"
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {comp.tiers.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    background: comp.highlight
                      ? "rgba(168,85,247,0.1)"
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${comp.highlight ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: comp.highlight ? "#d8b4fe" : "#94a3b8",
                      }}
                    >
                      {tier.name}
                    </div>
                    {tier.note && (
                      <div
                        style={{
                          fontSize: 9.5,
                          color: "#475569",
                          marginTop: 1,
                        }}
                      >
                        {tier.note}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: comp.highlight ? "#a855f7" : "#64748b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tier.price}
                    {tier.price !== "Custom" && (
                      <span
                        style={{ fontSize: 9, fontWeight: 400, color: "#475569" }}
                      >
                        /mo
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Feature Comparison Grid */}
      <div
        style={{
          background: "rgba(10,10,26,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* GalaxyBots column highlight overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "25%",
            height: "100%",
            background: "linear-gradient(180deg, rgba(168,85,247,0.08) 0%, rgba(129,140,248,0.05) 100%)",
            borderLeft: "1px solid rgba(168,85,247,0.25)",
            pointerEvents: "none",
          }}
        />

        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1fr",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              fontSize: 10,
              fontWeight: 700,
              color: "#475569",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Feature
          </div>
          {competitors.map((comp) => (
            <div
              key={comp.name}
              style={{
                padding: "10px 8px",
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color: comp.highlight ? "#c084fc" : "#64748b",
                borderLeft: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: comp.color,
                  flexShrink: 0,
                  display: "inline-block",
                }}
              />
              {comp.name}
            </div>
          ))}
        </div>

        {/* Feature rows */}
        {features.map((feature, i) => (
          <div
            key={feature.name}
            style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1fr 1fr 1fr 1fr",
              borderBottom:
                i < features.length - 1
                  ? "1px solid rgba(255,255,255,0.04)"
                  : "none",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "rgba(168,85,247,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)";
            }}
          >
            <div
              style={{
                padding: "9px 16px",
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
              }}
            >
              {feature.name}
            </div>
            {feature.values.map((val, j) => (
              <div
                key={j}
                style={{
                  padding: "9px 8px",
                  textAlign: "center",
                  borderLeft: "1px solid rgba(255,255,255,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 38,
                }}
              >
                {renderValue(val)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>
            <span>Included</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
            <span style={{ color: "#ef4444", fontWeight: 700, opacity: 0.7 }}>✗</span>
            <span>Not available</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
            <span style={{ color: "#94a3b8" }}>~</span>
            <span>Partial / Limited</span>
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#334155",
            fontStyle: "italic",
          }}
        >
          Pricing verified March 2026 · GalaxyBots.ai
        </div>
      </div>
    </div>
  );
}
