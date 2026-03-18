export default function Slide11Approvals() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#08091A" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(212,168,83,0.06) 0%, transparent 55%)" }} />
      <div className="relative flex h-full flex-col px-[8vw] py-[7vh]">
        <div style={{ fontFamily: "Inter", fontSize: "1.2vw", color: "#D4A853", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1.5vh" }}>Step 8</div>
        <div style={{ width: "4vw", height: "0.25vh", background: "linear-gradient(90deg, #D4A853, transparent)", marginBottom: "2.5vh" }} />
        <h2 style={{ fontFamily: "Outfit", fontSize: "4vw", fontWeight: 800, color: "#E8EAF0", letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
          Stay in Control with Approvals
        </h2>
        <p style={{ fontFamily: "Inter", fontSize: "1.7vw", color: "#6B7296", marginBottom: "5vh" }}>
          Sensitive actions require your sign-off before execution
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "0", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1, background: "rgba(107,114,150,0.10)", border: "1px solid rgba(107,114,150,0.25)", borderRadius: "1vw", padding: "3.5vh 2vw", textAlign: "center" }}>
              <div style={{ fontFamily: "Outfit", fontSize: "3vw", fontWeight: 900, color: "#6B7296", marginBottom: "1.5vh" }}>AI</div>
              <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 700, color: "#6B7296", lineHeight: 1.2 }}>Bots Request Action</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "0 1vw" }}>
              <div style={{ width: "3vw", height: "2px", background: "linear-gradient(90deg, #D4A853, #3D7FE8)" }} />
              <div style={{ width: 0, height: 0, borderTop: "0.6vh solid transparent", borderBottom: "0.6vh solid transparent", borderLeft: "1vw solid #3D7FE8" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1, background: "rgba(212,168,83,0.12)", border: "1px solid rgba(212,168,83,0.35)", borderRadius: "1vw", padding: "3.5vh 2vw", textAlign: "center" }}>
              <div style={{ fontFamily: "Outfit", fontSize: "3vw", fontWeight: 900, color: "#D4A853", marginBottom: "1.5vh" }}>→</div>
              <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 700, color: "#D4A853", lineHeight: 1.2 }}>You Review in Command Center</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "0 1vw" }}>
              <div style={{ width: "3vw", height: "2px", background: "linear-gradient(90deg, #D4A853, #3D7FE8)" }} />
              <div style={{ width: 0, height: 0, borderTop: "0.6vh solid transparent", borderBottom: "0.6vh solid transparent", borderLeft: "1vw solid #3D7FE8" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1, background: "rgba(61,127,232,0.12)", border: "1px solid rgba(61,127,232,0.35)", borderRadius: "1vw", padding: "3.5vh 2vw", textAlign: "center" }}>
              <div style={{ fontFamily: "Outfit", fontSize: "3vw", fontWeight: 900, color: "#3D7FE8", marginBottom: "1.5vh" }}>OK</div>
              <div style={{ fontFamily: "Outfit", fontSize: "1.8vw", fontWeight: 700, color: "#3D7FE8", lineHeight: 1.2 }}>Approve or Reject</div>
            </div>
          </div>
        </div>
        <p style={{ fontFamily: "Inter", fontSize: "1.6vw", color: "#6B7296", marginTop: "3vh", textAlign: "center", fontStyle: "italic" }}>
          "You govern every consequential decision. Nothing runs without your authority."
        </p>
      </div>
    </div>
  );
}
