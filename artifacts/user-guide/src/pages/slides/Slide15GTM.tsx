export default function Slide15GTM() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1530 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 80% 30%, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5vh" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Go-To-Market Strategy</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh" }} />
          </div>
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1.2vw" }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>Brand Maven Priya + Closer King Rivera</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4vw", flex: 1 }}>
          <div style={{ width: "35%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <h1 className="font-display" style={{ fontSize: "3vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "2vh" }}>
                Three Motions. One Flywheel.
              </h1>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#3b82f6", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>Content-Led</div>
                    <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>BingoLingo self-demonstrates — we use our own product to generate the content that attracts clients</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#f59e0b", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>Partner-Led</div>
                    <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>12 agency partners in Year 1; each brings 5–10 clients → 60–120 accounts from channel alone</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1vw" }}>
                  <div style={{ width: "0.5vw", height: "0.5vw", background: "#3b82f6", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f0f4ff" }}>Community-Led</div>
                    <div style={{ fontSize: "1.1vw", color: "#94a3b8" }}>GalaxyBots Commander Community — executives share missions and cross-pollinate use cases</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="quote-panel" style={{ borderRadius: "6px" }}>
              <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
                "Our best salesperson is a client who got results. We engineer that moment in the first 30 days or we have failed at onboarding."
              </div>
              <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— Brand Maven Priya</div>
            </div>
          </div>

          <div style={{ width: "65%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#3b82f6", marginBottom: "2vh", letterSpacing: "0.05em", textTransform: "uppercase" }}>Year 1 Priorities</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
              {[
                { num: "01", text: "Close first 10 white-label agency partners — our distribution army starts here", color: "#3b82f6" },
                { num: "02", text: "Launch Prospector Phases 1–4 — AEO scanning engine fully operational by Q4 2026", color: "#f59e0b" },
                { num: "03", text: "Achieve 90-day NRR > 110% — prove the expansion model before scaling acquisition", color: "#3b82f6" },
                { num: "04", text: "Publish 3 AEO case studies with real before/after Cloud 9 Score data — proof of concept at market scale", color: "#f59e0b" },
              ].map((item) => (
                <div key={item.num} style={{ display: "flex", alignItems: "center", gap: "2vw", background: "rgba(17,24,41,0.9)", border: `1px solid rgba(${item.color === "#3b82f6" ? "59,130,246" : "245,158,11"},0.2)`, borderRadius: "8px", padding: "2vh 2vw" }}>
                  <div className="font-display" style={{ fontSize: "2.5vw", fontWeight: 700, color: item.color, minWidth: "3.5vw" }}>{item.num}</div>
                  <div style={{ fontSize: "1.15vw", color: "#f0f4ff", lineHeight: 1.5 }}>{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #3b82f6, #f59e0b)" }} />
    </div>
  );
}
