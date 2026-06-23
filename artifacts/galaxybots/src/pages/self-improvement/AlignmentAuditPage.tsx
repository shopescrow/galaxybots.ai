import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  Loader2,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  Building2,
  Network,
} from "lucide-react";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AlignmentRule = {
  id: number;
  clusterId: string | null;
  extractedSoftRule: string | null;
  softRuleConfidence: number | null;
  softRuleStatus: string | null;
  patternCategory: string | null;
  sourceStakeholder: "owner" | "client" | "downstream";
  createdAt: string;
};

const STAKEHOLDER_ICON: Record<string, React.ElementType> = {
  owner: User,
  client: Building2,
  downstream: Network,
};
const STAKEHOLDER_COLOR: Record<string, string> = {
  owner: "text-purple-500",
  client: "text-blue-500",
  downstream: "text-green-500",
};
const STATUS_COLOR: Record<string, string> = {
  proposed: "text-yellow-500",
  active: "text-green-500",
  disabled: "text-muted-foreground",
};

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-xs font-tech text-muted-foreground w-8 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function RuleCard({ rule, onAction }: { rule: AlignmentRule; onAction: (clusterId: string, action: "enable" | "disable") => void }) {
  const StakeholderIcon = STAKEHOLDER_ICON[rule.sourceStakeholder] ?? User;
  const stakeholderColor = STAKEHOLDER_COLOR[rule.sourceStakeholder] ?? "text-muted-foreground";
  const statusColor = STATUS_COLOR[rule.softRuleStatus ?? "proposed"] ?? "text-muted-foreground";

  return (
    <Card className="border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <StakeholderIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${stakeholderColor}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={`text-[10px] capitalize ${stakeholderColor}`}>
                {rule.sourceStakeholder}
              </Badge>
              {rule.patternCategory && (
                <Badge variant="outline" className="text-[10px]">
                  {rule.patternCategory}
                </Badge>
              )}
              <span className={`text-[10px] font-tech uppercase ${statusColor}`}>
                {rule.softRuleStatus}
              </span>
            </div>

            <p className="text-sm leading-relaxed">{rule.extractedSoftRule ?? "—"}</p>

            {rule.softRuleConfidence != null && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <ConfidenceBar value={rule.softRuleConfidence} />
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                Extracted {new Date(rule.createdAt).toLocaleDateString()}
              </span>
              {rule.clusterId && (
                <div className="flex gap-2">
                  {rule.softRuleStatus !== "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
                      onClick={() => onAction(rule.clusterId!, "enable")}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Enable
                    </Button>
                  )}
                  {rule.softRuleStatus !== "disabled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => onAction(rule.clusterId!, "disable")}
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Disable
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AlignmentAuditPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("proposed");

  const rules = useQuery<AlignmentRule[]>({
    queryKey: ["self-improvement", "alignment-rules", statusFilter],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/alignment/rules?status=${statusFilter}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const summary = useQuery({
    queryKey: ["self-improvement", "alignment-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/alignment/summary`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Record<string, unknown>>;
    },
  });

  const action = useMutation({
    mutationFn: async ({ clusterId, act }: { clusterId: string; act: "enable" | "disable" }) => {
      const res = await fetch(`${BASE}/api/self-improvement/alignment/rules/${encodeURIComponent(clusterId)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["self-improvement", "alignment-rules"] });
      qc.invalidateQueries({ queryKey: ["self-improvement", "alignment-summary"] });
    },
  });

  const byStakeholder = (summary.data?.byStakeholder as Record<string, number>) ?? {};

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <Shield className="w-3 h-3 mr-1" />
                Multi-Stakeholder Alignment
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Alignment <span className="text-gradient">Audit</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Learned preferences · Soft rules · Manual override controls
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
          {[
            { icon: User, label: "Owner", color: "text-purple-500", key: "owner" },
            { icon: Building2, label: "Client", color: "text-blue-500", key: "client" },
            { icon: Network, label: "Downstream", color: "text-green-500", key: "downstream" },
          ].map(({ icon: Icon, label, color, key }) => (
            <Card key={key} className="border-border/50 col-span-1">
              <CardContent className="p-4 text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                <p className="text-xl font-display font-bold">{byStakeholder[key] ?? 0}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
          <Card className="border-border/50 col-span-1">
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-xl font-display font-bold">{summary.data?.proposedRules ?? 0}</p>
              <p className="text-xs text-muted-foreground">Proposed</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 col-span-1">
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <p className="text-xl font-display font-bold">{summary.data?.activeRules ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 col-span-1">
            <CardContent className="p-4 text-center">
              <XCircle className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xl font-display font-bold">{summary.data?.disabledRules ?? 0}</p>
              <p className="text-xs text-muted-foreground">Disabled</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2 mb-6">
          {["proposed", "active", "disabled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {rules.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (rules.data?.length ?? 0) === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {statusFilter === "proposed"
                ? "No proposed rules yet. Alignment extraction runs weekly when enough signals accumulate."
                : `No ${statusFilter} rules.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(rules.data ?? []).map((rule) => (
              <ErrorBoundary key={rule.id}>
                <RuleCard
                  rule={rule}
                  onAction={(clusterId, act) => action.mutate({ clusterId, act })}
                />
              </ErrorBoundary>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
