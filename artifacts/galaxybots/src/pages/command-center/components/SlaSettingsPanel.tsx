import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { BASE, type SlaConfig } from "./types";

export function SlaSettingsPanel() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: slaConfig, isLoading } = useQuery<SlaConfig>({
    queryKey: ["sla-config"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/approval-sla-config`, { headers });
      if (!res.ok) return { defaultSlaMinutes: 240, timeSensitiveSlaMinutes: 60, secondaryApproverEmail: null, trustedCategories: [] };
      return res.json();
    },
  });

  const [defaultSla, setDefaultSla] = useState<string>("");
  const [timeSensitiveSla, setTimeSensitiveSla] = useState<string>("");
  const [secondaryEmail, setSecondaryEmail] = useState<string>("");
  const [trustedCats, setTrustedCats] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (slaConfig && !initialized) {
      setDefaultSla(String(slaConfig.defaultSlaMinutes));
      setTimeSensitiveSla(String(slaConfig.timeSensitiveSlaMinutes));
      setSecondaryEmail(slaConfig.secondaryApproverEmail ?? "");
      setTrustedCats((slaConfig.trustedCategories ?? []).join(", "));
      setInitialized(true);
    }
  }, [slaConfig, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/approval-sla-config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          defaultSlaMinutes: Number(defaultSla) || 240,
          timeSensitiveSlaMinutes: Number(timeSensitiveSla) || 60,
          secondaryApproverEmail: secondaryEmail || null,
          trustedCategories: trustedCats.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed to save SLA settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sla-config"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border/30">
        <CardTitle className="text-lg flex items-center gap-2 font-tech">
          <Settings className="w-5 h-5 text-primary" />
          Approval SLA Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default SLA (minutes)</label>
                <Input
                  type="number"
                  value={defaultSla}
                  onChange={(e) => setDefaultSla(e.target.value)}
                  placeholder="240"
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Standard approval deadline. Default: 240 min (4h)</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Time-Sensitive SLA (minutes)</label>
                <Input
                  type="number"
                  value={timeSensitiveSla}
                  onChange={(e) => setTimeSensitiveSla(e.target.value)}
                  placeholder="60"
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">For email/SMS/invoice tools. Default: 60 min (1h)</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Secondary Approver Email</label>
              <Input
                type="email"
                value={secondaryEmail}
                onChange={(e) => setSecondaryEmail(e.target.value)}
                placeholder="manager@company.com"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Receives email when SLA is breached</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Trusted Categories (auto-approved)</label>
              <Input
                value={trustedCats}
                onChange={(e) => setTrustedCats(e.target.value)}
                placeholder="web_search, read_email"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Comma-separated tool names that bypass approval queue</p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 font-tech"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Settings
            </Button>
            {saveMutation.isSuccess && (
              <p className="text-xs text-green-400">Settings saved successfully</p>
            )}
            {saveMutation.isError && (
              <p className="text-xs text-red-400">Failed to save settings</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
