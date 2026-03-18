import screenshotPng from "@assets/image_1773802847259.png";

export default function Slide03CommandCenter() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <img
        src={screenshotPng}
        alt="GalaxyBots Command Center"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }}
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(8,9,26,0.97) 0%, rgba(8,9,26,0.7) 35%, rgba(8,9,26,0.45) 65%, rgba(8,9,26,0.75) 100%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 2</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Your Command Center
        </h2>
        <p style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#6B7296", marginBottom: "4vh" }}>
          This is your ops hub. Everything your bots do is visible here.
        </p>
        <div style={{ display: "flex", gap: "2vw" }}>
          <div style={{ background: "rgba(212,168,83,0.12)", border: "1px solid rgba(212,168,83,0.35)", borderRadius: "0.8vw", padding: "1.5vh 2vw" }}>
            <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>Activity Feed</div>
            <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#6B7296", marginTop: "0.5vh" }}>Live bot action log</div>
          </div>
          <div style={{ background: "rgba(61,127,232,0.12)", border: "1px solid rgba(61,127,232,0.35)", borderRadius: "0.8vw", padding: "1.5vh 2vw" }}>
            <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#3D7FE8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>Pending Approvals</div>
            <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#6B7296", marginTop: "0.5vh" }}>Actions awaiting sign-off</div>
          </div>
          <div style={{ background: "rgba(107,114,150,0.10)", border: "1px solid rgba(107,114,150,0.25)", borderRadius: "0.8vw", padding: "1.5vh 2vw" }}>
            <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#E8EAF0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>Company Status</div>
            <div style={{ fontFamily: "Inter", fontSize: "1.4vw", color: "#6B7296", marginTop: "0.5vh" }}>Fleet health at a glance</div>
          </div>
        </div>
        <div style={{ marginTop: "auto", fontFamily: "Inter", fontSize: "1.5vw", color: "#3D7FE8", fontWeight: 500 }}>
          → Command Center in left nav
        </div>
      </div>
    </div>
  );
}
