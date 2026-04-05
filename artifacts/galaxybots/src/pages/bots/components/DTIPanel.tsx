import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SAAS_DATA, InsightBar } from "./constants";

export function DTIPanel() {
  const dti = SAAS_DATA.dti;

  const getRiskBadge = (dscr: number) => {
    if (dscr >= 3) return <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Low Risk</Badge>;
    if (dscr >= 1.5) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Moderate Risk</Badge>;
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/30">High Risk</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Traditional DTI", value: `${dti.traditionalDti}%`, sub: "Total debt / annual revenue", color: "text-amber-500" },
          { label: "SaaS-Optimized DTI", value: `${dti.saasOptimizedDti}%`, sub: "Debt / ARR (recurring)", color: "text-green-500" },
          { label: "DSCR", value: `${dti.dscr}x`, sub: "Debt service coverage ratio", color: "text-green-500" },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Risk Interpretation</CardTitle>
            {getRiskBadge(dti.dscr)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">Total Debt</p>
              <p className="font-bold">${(dti.totalDebt / 1e6).toFixed(2)}M</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">Annual Revenue (ARR)</p>
              <p className="font-bold">${(dti.annualRevenue / 1e6).toFixed(2)}M</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">Monthly Debt Service</p>
              <p className="font-bold">${dti.monthlyDebt.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">EBITDA (TTM)</p>
              <p className="font-bold">${(dti.ebitda / 1e6).toFixed(2)}M</p>
            </div>
          </div>
          <div className="border-t border-border/30 pt-4 space-y-3">
            <div>
              <p className="text-xs font-bold mb-1">Traditional DTI ({dti.traditionalDti}%)</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(dti.traditionalDti, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Below 40% is acceptable for lenders; below 20% is preferred.</p>
            </div>
            <div>
              <p className="text-xs font-bold mb-1">SaaS-Optimized DTI ({dti.saasOptimizedDti}%)</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(dti.saasOptimizedDti, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Adjusted for recurring revenue — banks and VCs prefer this metric for SaaS.</p>
            </div>
            <div>
              <p className="text-xs font-bold mb-1">DSCR ({dti.dscr}x)</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min((dti.dscr / 5) * 100, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">&gt;1.25x = lender minimum; &gt;2x = healthy; &gt;3x = excellent credit standing.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <InsightBar insights={[
        `DSCR of ${dti.dscr}x means you generate ${dti.dscr}x the cash needed to service all debt — excellent position for any debt financing round.`,
        "SaaS-optimized DTI of 20.5% is below the 25% threshold that most growth lenders require. You can safely take on 20-25% more debt if needed for growth.",
        "Traditional DTI understates your capacity because it ignores the predictable, recurring nature of ARR. Always present SaaS DTI to potential lenders.",
      ]} />
    </div>
  );
}
