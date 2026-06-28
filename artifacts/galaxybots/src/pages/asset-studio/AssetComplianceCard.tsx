import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ScanLine,
  Save,
} from "lucide-react";
import {
  firewallGet,
  firewallPost,
  firewallPut,
  DISCLOSURE_STATE_OPTIONS,
  type ComplianceCheck,
  type LicenseRecord,
  type PolicyConfig,
  type GateResult,
  type FirewallDecision,
} from "@/lib/firewall-fetch";

interface AssetFirewallView {
  asset: { id: number; targetPlatform: string | null };
  license: LicenseRecord;
  latestCheck: ComplianceCheck | null;
  policy: { config: PolicyConfig | null; effective: Record<string, unknown> };
}

const DECISION_CONFIG: Record<
  FirewallDecision,
  { icon: typeof ShieldCheck; color: string; label: string }
> = {
  pass: { icon: ShieldCheck, color: "text-emerald-400", label: "Pass" },
  flag: { icon: ShieldAlert, color: "text-yellow-400", label: "Flag" },
  block: { icon: ShieldX, color: "text-destructive", label: "Block" },
};

function DecisionBadge({ decision }: { decision: FirewallDecision }) {
  const cfg = DECISION_CONFIG[decision] ?? DECISION_CONFIG.pass;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} border-current/30 gap-1`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export function AssetComplianceCard({ assetId }: { assetId: number }) {
  const { toast } = useToast();
  const [data, setData] = useState<AssetFirewallView | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable license fields.
  const [aiGenerated, setAiGenerated] = useState(true);
  const [usageRights, setUsageRights] = useState("");
  const [disclosureState, setDisclosureState] = useState("required");
  const [disclosureText, setDisclosureText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const view = await firewallGet<AssetFirewallView>(`/assets/${assetId}`);
      setData(view);
      setAiGenerated(view.license.aiGenerated);
      setUsageRights(view.license.usageRights ?? "");
      setDisclosureState(view.license.disclosureState);
      setDisclosureText(view.license.disclosureText ?? "");
    } catch (e) {
      toast({
        title: "Could not load compliance data",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [assetId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function runCheck() {
    setRunning(true);
    try {
      const result = await firewallPost<GateResult>(`/assets/${assetId}/run`);
      toast({
        title: `Firewall: ${result.decision.toUpperCase()}`,
        description: result.reasons.length
          ? result.reasons.join(" ")
          : "No issues found.",
        variant: result.decision === "block" ? "destructive" : "default",
      });
      await load();
    } catch (e) {
      toast({
        title: "Check failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  async function saveLicense() {
    setSaving(true);
    try {
      await firewallPut(`/assets/${assetId}/license`, {
        aiGenerated,
        usageRights: usageRights.trim() || null,
        disclosureState,
        disclosureText: disclosureText.trim() || null,
      });
      toast({ title: "Rights record saved" });
      await load();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const latest = data?.latestCheck;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Compliance &amp; Rights
        </CardTitle>
        <Button size="sm" variant="outline" onClick={runCheck} disabled={running || loading}>
          {running ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <ScanLine className="h-4 w-4 mr-1.5" />
          )}
          Run firewall check
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Latest gate decision */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Latest firewall decision
                </span>
                {latest ? (
                  <DecisionBadge decision={latest.decision} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not checked yet
                  </span>
                )}
              </div>
              {latest?.checks?.length ? (
                <div className="space-y-1.5">
                  {latest.checks.map((item, i) => {
                    const cfg = DECISION_CONFIG[item.status] ?? DECISION_CONFIG.pass;
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                        <span className="text-muted-foreground">
                          <span className="text-foreground">{item.name}:</span>{" "}
                          {item.reason}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* License / rights record editor */}
            <div className="space-y-3 border-t border-border pt-4">
              <span className="text-xs font-medium text-muted-foreground">
                License &amp; rights record
              </span>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={aiGenerated}
                  onChange={(e) => setAiGenerated(e.target.checked)}
                />
                AI-generated asset
              </label>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Usage rights</label>
                <Input
                  value={usageRights}
                  onChange={(e) => setUsageRights(e.target.value)}
                  placeholder="e.g. Full commercial rights; stock under CC0"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    AI-disclosure state
                  </label>
                  <Select value={disclosureState} onValueChange={setDisclosureState}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCLOSURE_STATE_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  AI-disclosure text
                </label>
                <Textarea
                  value={disclosureText}
                  onChange={(e) => setDisclosureText(e.target.value)}
                  placeholder="e.g. This product was created with AI assistance."
                  rows={2}
                />
                <p className="text-[11px] text-muted-foreground">
                  Set the state to “tagged” and add disclosure text to clear a
                  disclosure flag before publishing.
                </p>
              </div>

              <Button size="sm" onClick={saveLicense} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Save rights record
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
