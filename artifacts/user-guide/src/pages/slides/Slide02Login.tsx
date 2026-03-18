export default function Slide02Login() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 80% at 0% 50%, rgba(61,127,232,0.10) 0%, transparent 60%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>
          Step 1
        </div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "3vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "5vh" }}>
          Log In
        </h2>
        <div className="flex flex-1 gap-[6vw] items-start">
          <div className="flex-1">
            <div style={{ display: "flex", flexDirection: "column", gap: "2.5vh" }}>
              <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
                <div style={{ minWidth: "3.5vw", height: "3.5vw", borderRadius: "50%", background: "rgba(212,168,83,0.15)", border: "1px solid rgba(212,168,83,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.5vw", color: "#D4A853" }}>1</div>
                <div>
                  <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 600, color: "#E8EAF0", marginBottom: "0.5vh" }}>Navigate to your GalaxyBots URL</div>
                  <div style={{ fontFamily: "Inter", fontSize: "1.5vw", color: "#6B7296" }}>Open the link provided by your administrator</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
                <div style={{ minWidth: "3.5vw", height: "3.5vw", borderRadius: "50%", background: "rgba(212,168,83,0.15)", border: "1px solid rgba(212,168,83,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.5vw", color: "#D4A853" }}>2</div>
                <div>
                  <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 600, color: "#E8EAF0", marginBottom: "0.5vh" }}>Enter your credentials</div>
                  <div style={{ fontFamily: "Inter", fontSize: "1.5vw", color: "#6B7296" }}>Email and password set during onboarding</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "2vw", alignItems: "flex-start" }}>
                <div style={{ minWidth: "3.5vw", height: "3.5vw", borderRadius: "50%", background: "rgba(61,127,232,0.15)", border: "1px solid rgba(61,127,232,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.5vw", color: "#3D7FE8" }}>3</div>
                <div>
                  <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 600, color: "#E8EAF0", marginBottom: "0.5vh" }}>Enterprise SSO users</div>
                  <div style={{ fontFamily: "Inter", fontSize: "1.5vw", color: "#6B7296" }}>SSO is auto-detected from your email domain — no separate login needed</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: "4vh", fontFamily: "Inter", fontSize: "1.5vw", color: "#3D7FE8", fontWeight: 500 }}>
              → Your dashboard loads automatically after login
            </div>
          </div>
          <div style={{ width: "30vw", background: "#0E1029", border: "1px solid rgba(212,168,83,0.2)", borderRadius: "1.2vw", padding: "3vw 2.5vw", flexShrink: 0 }}>
            <div style={{ fontFamily: "Inter", fontSize: "1.3vw", color: "#6B7296", marginBottom: "2.5vh", textTransform: "uppercase", letterSpacing: "0.15em" }}>GalaxyBots.ai</div>
            <div style={{ marginBottom: "2vh" }}>
              <div style={{ fontFamily: "Inter", fontSize: "1.3vw", color: "#6B7296", marginBottom: "0.8vh" }}>Email</div>
              <div style={{ background: "#131630", border: "1px solid rgba(61,127,232,0.4)", borderRadius: "0.5vw", height: "4.5vh", paddingLeft: "1.5vw", display: "flex", alignItems: "center" }}>
                <div style={{ width: "12vw", height: "0.2vh", background: "rgba(107,114,150,0.3)", borderRadius: "1px" }} />
              </div>
            </div>
            <div style={{ marginBottom: "3vh" }}>
              <div style={{ fontFamily: "Inter", fontSize: "1.3vw", color: "#6B7296", marginBottom: "0.8vh" }}>Password</div>
              <div style={{ background: "#131630", border: "1px solid rgba(107,114,150,0.3)", borderRadius: "0.5vw", height: "4.5vh", paddingLeft: "1.5vw", display: "flex", alignItems: "center", gap: "0.5vw" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", borderRadius: "50%", background: "#6B7296" }} />
                <div style={{ width: "0.6vw", height: "0.6vw", borderRadius: "50%", background: "#6B7296" }} />
                <div style={{ width: "0.6vw", height: "0.6vw", borderRadius: "50%", background: "#6B7296" }} />
                <div style={{ width: "0.6vw", height: "0.6vw", borderRadius: "50%", background: "#6B7296" }} />
                <div style={{ width: "0.6vw", height: "0.6vw", borderRadius: "50%", background: "#6B7296" }} />
              </div>
            </div>
            <div style={{ background: "#D4A853", borderRadius: "0.5vw", height: "5vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Outfit", fontWeight: 700, fontSize: "1.5vw", color: "#08091A" }}>
              Sign In
            </div>
            <div style={{ textAlign: "center", marginTop: "2vh", fontFamily: "Inter", fontSize: "1.3vw", color: "#3D7FE8" }}>SSO Login</div>
          </div>
        </div>
      </div>
    </div>
  );
}
