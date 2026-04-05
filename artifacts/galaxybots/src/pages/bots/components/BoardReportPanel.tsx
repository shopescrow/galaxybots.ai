import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { useState } from "react";
import { SAAS_DATA, DEMO_BADGE, InsightBar } from "./constants";

export function BoardReportPanel() {
  const d = SAAS_DATA;
  const [generated, setGenerated] = useState(false);

  const report = `BOARD OF DIRECTORS — FINANCIAL REPORT
Period: Q1 2026 | Prepared by: CFO Sentinel Marcus
Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The company closed Q1 2026 with ARR of $5.85M, representing 38% year-over-year growth and tracking above the 25% SaaS industry median. MRR reached $487,250, up 7.8% month-over-month, driven by $28.6K in expansion revenue and $52.4K in new logo ARR. Net Revenue Retention of 112% confirms strong product-market fit and effective land-and-expand motion.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY PERFORMANCE INDICATORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ARR:               $${(d.currentARR / 1e6).toFixed(2)}M  (+38% YoY)
  MRR:               $${(d.currentMRR / 1000).toFixed(0)}K  (+7.8% MoM)
  NRR:               ${d.nrr}%         (target: >110%)
  GRR:               ${d.grr}%          (target: >90%)
  Gross Margin:      ${d.grossMargin}%          (target: >70%)
  Monthly Burn:      $${(d.burnRate / 1000).toFixed(0)}K
  Bank Balance:      $${(d.bankBalance / 1e6).toFixed(2)}M
  Runway:            ${Math.round(d.bankBalance / d.burnRate)} months
  Churn Rate:        ${d.churnRate}%/mo     (target: <2.5%)
  LTV:CAC:           ${(d.ltv / d.cac).toFixed(1)}x          (target: >3x)
  CAC Payback:       ${d.cacPayback} months  (target: <15mo)
  Rule of 40:        42%          (target: >40%)
  Magic Number:      0.87          (target: >0.75)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANCE ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  New MRR vs Plan:     $52.4K vs $48.0K  (+9.2% ahead of plan)
  Expansion vs Plan:   $28.6K vs $25.0K  (+14.4% ahead of plan)
  Churn vs Plan:       $33.3K vs $30.0K  (+11.0% — requires attention)
  Burn vs Budget:      $185K vs $195K    (5.1% favorable variance)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORWARD-LOOKING STATEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. At current growth rate, ARR will exceed $7.0M by Q4 2026 — this triggers the threshold for Series B conversations.
2. Churn exceeded plan by $3.3K this month. 5 at-risk accounts represent $258K ARR. Recommend urgent CS intervention.
3. A 10% price increase (72% probability scenario) would yield +$350K net ARR with minimal churn impact if executed at renewal cycles.
4. Runway of 17.5 months is comfortable. Begin Series B preparation at 12-month mark (approximately September 2026).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDED BOARD ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  □ Approve $120K CS team investment to address churn spike
  □ Authorize pricing increase initiative for Q2 rollout
  □ Ratify EMEA expansion feasibility study (Q2 deliverable)
  □ Commission Series B readiness assessment

[DEMO DATA — Connect live data sources to generate real board reports]`;

  return (
    <div className="space-y-6">
      {!generated ? (
        <Card className="border-border/50">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Board Report Generator</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Generate a board-ready executive financial summary covering all KPIs, variance analysis, and forward-looking statements.
              </p>
            </div>
            <Button onClick={() => setGenerated(true)} className="gap-2">
              <FileText className="w-4 h-4" />
              Generate Board Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Executive Summary — Q1 2026</CardTitle>
              <div className="flex gap-2">
                {DEMO_BADGE}
                <Button variant="outline" size="sm" onClick={() => {
                  const blob = new Blob([report], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "board-report-q1-2026.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  Download
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setGenerated(false)}>Reset</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/30 p-4 rounded-lg whitespace-pre-wrap overflow-x-auto leading-relaxed border border-border/30">
              {report}
            </pre>
          </CardContent>
        </Card>
      )}
      <InsightBar insights={[
        "Board report generated from live dashboard metrics. Connect Stripe, QuickBooks, and your bank feed to replace demo data with actuals.",
        "Variance analysis shows churn 11% over plan — lead with this in board discussions and present the CS investment proposal alongside.",
        "Forward-looking statements are model-generated. Review with your legal team before filing as forward guidance.",
      ]} />
    </div>
  );
}
