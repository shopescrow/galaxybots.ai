export default function Slide02Login() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1225 50%, #0a0e1a 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 30% 50%, rgba(139,92,246,0.07) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "5vh 6vw" }}>
        <div className="flex flex-col justify-between" style={{ width: "38%", paddingRight: "4vw" }}>
          <div>
            <div style={{ marginBottom: "1.5vh" }}>
              <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#8b5cf6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Step 1 of 8</span>
            </div>
            <div className="blue-rule" style={{ width: "5vw", marginBottom: "2vh", background: "linear-gradient(90deg, #8b5cf6, transparent)" }} />
            <h1 className="font-display" style={{ fontSize: "3.8vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2.5vh" }}>
              Log In
            </h1>
            <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "6px", padding: "2vh 1.5vw", marginBottom: "2.5vh" }}>
              <div style={{ fontSize: "1.2vw", color: "#94a3b8", lineHeight: 1.6 }}>
                Start by navigating to your GalaxyBots URL — provided by your administrator when your account was set up.
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "1.1vw", color: "#4a5568", lineHeight: 1.5, fontStyle: "italic" }}>
              Tip: Bookmark your GalaxyBots URL for fast access every session.
            </div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2.5vh" }}>
          <div className="stat-card" style={{ padding: "2.5vh 2vw" }}>
            <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "1.5vh", display: "flex", alignItems: "center", gap: "0.8vw" }}>
              <span style={{ background: "rgba(139,92,246,0.2)", borderRadius: "4px", padding: "0.3vh 0.8vw", fontSize: "1vw" }}>1</span>
              Navigate to your GalaxyBots URL
            </div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
              The URL is unique to your organization — e.g., <span style={{ color: "#8b5cf6", fontWeight: 600 }}>yourcompany.galaxybots.ai</span>
            </div>
          </div>

          <div className="stat-card" style={{ padding: "2.5vh 2vw" }}>
            <div style={{ fontSize: "1.2vw", color: "#3b82f6", fontWeight: 700, marginBottom: "1.5vh", display: "flex", alignItems: "center", gap: "0.8vw" }}>
              <span style={{ background: "rgba(59,130,246,0.2)", borderRadius: "4px", padding: "0.3vh 0.8vw", fontSize: "1vw" }}>2</span>
              Enter your email and password
            </div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
              Use the email address and password you created during onboarding, then click <span style={{ color: "#f0f4ff", fontWeight: 600 }}>Sign In</span>.
            </div>
          </div>

          <div className="stat-card" style={{ padding: "2.5vh 2vw", borderColor: "rgba(139,92,246,0.3)" }}>
            <div style={{ fontSize: "1.2vw", color: "#8b5cf6", fontWeight: 700, marginBottom: "1.5vh", display: "flex", alignItems: "center", gap: "0.8vw" }}>
              <span style={{ background: "rgba(139,92,246,0.2)", borderRadius: "4px", padding: "0.3vh 0.8vw", fontSize: "1vw" }}>SSO</span>
              Single Sign-On — Automatic
            </div>
            <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.5 }}>
              If your organization uses SSO, <span style={{ color: "#f0f4ff", fontWeight: 600 }}>no extra steps are needed</span>. GalaxyBots automatically detects your email domain and routes you through your company's SSO provider.
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #8b5cf6, #3b82f6)" }} />
    </div>
  );
}
