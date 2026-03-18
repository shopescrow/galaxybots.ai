export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 15% 40%, rgba(61,127,232,0.18) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 85% 70%, rgba(212,168,83,0.12) 0%, transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, #D4A853 40%, #D4A853 60%, transparent)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(61,127,232,0.4) 40%, rgba(61,127,232,0.4) 60%, transparent)" }} />
      <div className="relative flex h-full flex-col justify-between px-[8vw] py-[8vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.3vw", letterSpacing: "0.25em", color: "#D4A853", textTransform: "uppercase" }}>
          New User Guide
        </div>
        <div className="max-w-[65vw]">
          <div style={{ width: "5vw", height: "0.3vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "3vh" }} />
          <h1
            style={{
              fontFamily: "Outfit",
              fontSize: "6.5vw",
              fontWeight: 800,
              lineHeight: 0.92,
              letterSpacing: "-0.02em",
              color: "#E8EAF0",
            }}
          >
            Your AI Executive<br />Team Starts Here
          </h1>
          <p
            style={{
              fontFamily: "Inter",
              fontSize: "2vw",
              color: "#6B7296",
              marginTop: "3vh",
              fontWeight: 400,
              letterSpacing: "0.01em",
            }}
          >
            GalaxyBots.ai — New User Guide
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2vw",
            fontFamily: "Inter",
            fontSize: "1.4vw",
            color: "#4A5078",
          }}
        >
          <span>GalaxyBots.ai</span>
          <span style={{ color: "#D4A853" }}>•</span>
          <span>Fortune 500 Intelligence, at your command</span>
        </div>
      </div>
    </div>
  );
}
