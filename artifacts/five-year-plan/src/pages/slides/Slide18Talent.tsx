export default function Slide18Talent() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "linear-gradient(145deg, #0a0e1a 0%, #0d1530 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 50% at 70% 40%, rgba(245,158,11,0.05) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "4.5vh 6vw" }}>
        <div style={{ width: "38%", paddingRight: "4vw", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "1.1vw", fontWeight: 600, color: "#3b82f6", letterSpacing: "0.12em", textTransform: "uppercase" }}>Talent & Culture</span>
            <div className="gold-rule" style={{ width: "5vw", marginTop: "1.5vh", marginBottom: "2vh" }} />
            <h1 className="font-display" style={{ fontSize: "3.2vw", fontWeight: 700, color: "#f0f4ff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "1.5vh" }}>
              Commanders, Not Managers
            </h1>
            <p style={{ fontSize: "1.25vw", color: "#94a3b8", lineHeight: 1.6, marginBottom: "2vh" }}>
              Every team lead uses GalaxyBots to augment their own decision-making. We hire humans to do what AI cannot.
            </p>
            <div style={{ display: "flex", gap: "1vw", marginBottom: "2vh" }}>
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px", padding: "0.8vh 1vw", flex: 1 }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f59e0b" }}>HR Director Amara</div>
              </div>
              <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "6px", padding: "0.8vh 1vw", flex: 1 }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#3b82f6" }}>Talent Hunter Jade</div>
              </div>
            </div>
          </div>
          <div className="quote-panel" style={{ borderRadius: "6px" }}>
            <div style={{ fontSize: "1.2vw", color: "#f0f4ff", lineHeight: 1.65, fontStyle: "italic" }}>
              "We will hire humans to do what AI cannot: build trust, read rooms, and make judgment calls under ambiguity. Everything else, the bots handle."
            </div>
            <div style={{ marginTop: "1.2vh", fontSize: "1.1vw", color: "#f59e0b", fontWeight: 600 }}>— HR Director Amara</div>
          </div>
        </div>

        <div style={{ width: "62%", display: "flex", flexDirection: "column", gap: "2.5vh" }}>
          <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#3b82f6", marginBottom: "1.5vh" }}>Year 1 Critical Hires</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", background: "#f59e0b", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}><span style={{ fontWeight: 700, color: "#f59e0b" }}>Head of Partner Success</span> — owns white-label relationships and partner-channel NRR</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", background: "#f59e0b", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}><span style={{ fontWeight: 700, color: "#f59e0b" }}>Head of Growth</span> — owns client acquisition funnel and NRR expansion metrics</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", background: "#f59e0b", borderRadius: "50%", marginTop: "0.7vh", flexShrink: 0 }} />
                <div style={{ fontSize: "1.15vw", color: "#f0f4ff" }}><span style={{ fontWeight: 700, color: "#f59e0b" }}>Senior ML Engineer</span> — owns Prospector autonomous pipeline and multi-LLM routing</div>
              </div>
            </div>
          </div>

          <div style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "2.5vh 2vw" }}>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#f59e0b", marginBottom: "1.5vh" }}>Scale Plan: Year 2–3</div>
            <div style={{ display: "flex", gap: "3vw" }}>
              <div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>Engineering scales from 5 → 20 engineers as Prospector, BingoLingo, and Mobile mature simultaneously</div>
              </div>
              <div style={{ width: "0.1vw", background: "#1a2240" }} />
              <div>
                <div style={{ fontSize: "1.1vw", color: "#94a3b8", lineHeight: 1.6 }}>Regional Partner Directors hired for UK, Canada, and Australia ahead of Year 3 international launch</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vh" }}>
            {[
              { pillar: "Bias Toward Autonomy", desc: "People who own outcomes, not tasks" },
              { pillar: "Proof-of-Value Obsession", desc: "If you can't measure it, don't do it" },
              { pillar: "Hiring Filter", desc: `"Fortune 500 Intelligence for Everyone" is not marketing — it's the bar we hire to` },
            ].map((p) => (
              <div key={p.pillar} style={{ background: "rgba(17,24,41,0.9)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "8px", padding: "2vh 1.5vw" }}>
                <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#f0f4ff", marginBottom: "0.8vh" }}>{p.pillar}</div>
                <div style={{ fontSize: "1.05vw", color: "#94a3b8", lineHeight: 1.5 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: "0.3vh", background: "linear-gradient(90deg, #f59e0b, #3b82f6)" }} />
    </div>
  );
}
