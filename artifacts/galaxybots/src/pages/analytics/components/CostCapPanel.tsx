import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Shield } from "lucide-react";
import { useState } from "react";
import { BASE, type CostCapData } from "./types";

export function CostCapPanel() {
  const queryClient = useQueryClient();
  const [capAmount, setCapAmount] = useState("");
  const [alert80, setAlert80] = useState(true);
  const [pauseOnExhaust, setPauseOnExhaust] = useState(false);

  const { data: costCap, isLoading } = useQuery<CostCapData>({
    queryKey: ["analytics", "cost-cap"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/cost-cap`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateCap = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/cost-cap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyCapUsd: parseFloat(capAmount),
          alertAt80Pct: alert80,
          pauseAutonomousOnExhaust: pauseOnExhaust,
        }),
      });
      if (!res.ok) throw new Error("Failed to update cost cap");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const currentCap = costCap?.cap;
  const spend = costCap?.currentMonthlySpend ?? 0;
  const pctUsed = currentCap && currentCap.monthlyCapUsd > 0
    ? (spend / currentCap.monthlyCapUsd) * 100
    : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Cost Cap Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentCap && currentCap.monthlyCapUsd > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly spend</span>
              <span className="font-bold">${spend.toFixed(4)} / ${currentCap.monthlyCapUsd.toFixed(2)}</span>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pctUsed >= 100 ? "bg-destructive" : pctUsed >= 80 ? "bg-yellow-500" : "bg-primary"}`}
                style={{ width: `${Math.min(pctUsed, 100)}%` }}
              />
            </div>
            {pctUsed >= 80 && (
              <div className="flex items-center gap-1 text-xs text-yellow-500">
                <AlertTriangle className="w-3 h-3" />
                {pctUsed >= 100 ? "Cost cap exceeded!" : `${Math.round(pctUsed)}% of monthly cap used`}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Monthly Cap (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder={currentCap ? String(currentCap.monthlyCapUsd) : "50.00"}
              value={capAmount}
              onChange={(e) => setCapAmount(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Alert at 80% usage</Label>
            <Switch checked={alert80} onCheckedChange={setAlert80} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Pause autonomous runs at 100%</Label>
            <Switch checked={pauseOnExhaust} onCheckedChange={setPauseOnExhaust} />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => updateCap.mutate()}
            disabled={updateCap.isPending || !capAmount}
          >
            {updateCap.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save Cost Cap
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
