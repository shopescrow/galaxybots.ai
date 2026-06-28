import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  firewallGet,
  firewallPost,
  firewallPut,
  firewallDelete,
  POLICY_STRICTNESS_OPTIONS,
  type ComplianceCheck,
  type PolicyConfig,
  type FirewallDecision,
} from "@/lib/firewall-fetch";

const DECISION_CONFIG: Record<
  FirewallDecision,
  { icon: typeof ShieldCheck; color: string; label: string }
> = {
  pass: { icon: ShieldCheck, color: "text-emerald-400", label: "Pass" },
  flag: { icon: ShieldAlert, color: "text-yellow-400", label: "Flag" },
  block: { icon: ShieldX, color: "text-destructive", label: "Block" },
};

const REVIEW_LABELS: Record<string, { color: string; label: string }> = {
  auto_passed: { color: "text-emerald-400", label: "Auto-passed" },
  pending_review: { color: "text-yellow-400", label: "Pending review" },
  approved: { color: "text-emerald-400", label: "Approved" },
  rejected: { color: "text-destructive", label: "Rejected" },
  blocked: { color: "text-destructive", label: "Blocked" },
};

function DecisionBadge({ decision }: { decision: FirewallDecision }) {
  const cfg = DECISION_CONFIG[decision] ?? DECISION_CONFIG.pass;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} border-current/30 gap-1`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function CheckBreakdown({ check }: { check: ComplianceCheck }) {
  if (!check.checks?.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {check.checks.map((item, i) => {
        const cfg = DECISION_CONFIG[item.status] ?? DECISION_CONFIG.pass;
        const Icon = cfg.icon;
        return (
          <div key={i} className="flex items-start gap-2 text-xs font-tech">
            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
            <span className="text-muted-foreground">
              <span className="text-foreground">{item.name}:</span> {item.reason}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewQueue() {
  const [pending, setPending] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [noteFor, setNoteFor] = useState<ComplianceCheck | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPending(await firewallGet<ComplianceCheck[]>("/checks/pending"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(check: ComplianceCheck, action: "approve" | "reject") {
    setActing(check.id);
    try {
      await firewallPost(`/checks/${check.id}/review`, {
        action,
        note: note.trim() || undefined,
      });
      setNoteFor(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground font-tech py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading review queue…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-400" /> Human Review Queue
        </h3>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive font-tech">{error}</p>}

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground font-tech">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
            Nothing awaiting review.
          </CardContent>
        </Card>
      ) : (
        pending.map((check) => (
          <Card key={check.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-semibold truncate">
                      {check.assetTitle ?? `Asset #${check.assetId}`}
                    </span>
                    <DecisionBadge decision={check.decision} />
                    {check.targetPlatform && (
                      <Badge variant="outline" className="text-muted-foreground border-border/40">
                        {check.targetPlatform}
                      </Badge>
                    )}
                  </div>
                  <CheckBreakdown check={check} />
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-emerald-400 border-emerald-400/30"
                    disabled={acting === check.id}
                    onClick={() => {
                      setNoteFor(check);
                      setNote("");
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Review
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Review: {noteFor?.assetTitle ?? `Asset #${noteFor?.assetId}`}
            </DialogTitle>
          </DialogHeader>
          {noteFor && <CheckBreakdown check={noteFor} />}
          <Input
            placeholder="Reviewer note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-2"
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="gap-1 text-destructive border-destructive/30"
              disabled={acting === noteFor?.id}
              onClick={() => noteFor && review(noteFor, "reject")}
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
            <Button
              className="gap-1"
              disabled={acting === noteFor?.id}
              onClick={() => noteFor && review(noteFor, "approve")}
            >
              {acting === noteFor?.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecentChecks() {
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChecks(await firewallGet<ComplianceCheck[]>("/checks", { limit: 50 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load checks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground font-tech py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading checks…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Recent Gate Decisions
        </h3>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive font-tech">{error}</p>}

      {checks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground font-tech">
            No firewall checks recorded yet.
          </CardContent>
        </Card>
      ) : (
        checks.map((check) => {
          const review = REVIEW_LABELS[check.reviewStatus];
          return (
            <Card key={check.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-semibold truncate">
                    {check.assetTitle ?? `Asset #${check.assetId}`}
                  </span>
                  <DecisionBadge decision={check.decision} />
                  {review && (
                    <span className={`text-xs font-tech ${review.color}`}>
                      {review.label}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-tech ml-auto">
                    {format(new Date(check.createdAt), "MMM d, HH:mm")}
                  </span>
                </div>
                <CheckBreakdown check={check} />
                {check.reviewNote && (
                  <p className="text-xs text-muted-foreground font-tech mt-2 italic">
                    Note: {check.reviewNote}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

interface PolicyForm {
  platform: string;
  strictness: string;
  aiContentAllowed: boolean;
  disclosureRequired: boolean;
  similarityThreshold: string;
  prohibitedKeywords: string;
  notes: string;
}

const EMPTY_POLICY: PolicyForm = {
  platform: "",
  strictness: "standard",
  aiContentAllowed: true,
  disclosureRequired: true,
  similarityThreshold: "0.72",
  prohibitedKeywords: "",
  notes: "",
};

function PolicyConfigSection() {
  const [policies, setPolicies] = useState<PolicyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PolicyForm>(EMPTY_POLICY);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPolicies(await firewallGet<PolicyConfig[]>("/policies"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form.platform.trim()) {
      setError("Platform is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await firewallPut("/policies", {
        platform: form.platform.trim(),
        strictness: form.strictness,
        aiContentAllowed: form.aiContentAllowed,
        disclosureRequired: form.disclosureRequired,
        similarityThreshold: Number(form.similarityThreshold),
        prohibitedKeywords: form.prohibitedKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        notes: form.notes.trim() || null,
      });
      setForm(EMPTY_POLICY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await firewallDelete(`/policies/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function edit(p: PolicyConfig) {
    setForm({
      platform: p.platform,
      strictness: p.strictness,
      aiContentAllowed: p.aiContentAllowed,
      disclosureRequired: p.disclosureRequired,
      similarityThreshold: String(p.similarityThreshold),
      prohibitedKeywords: (p.prohibitedKeywords ?? []).join(", "),
      notes: p.notes ?? "",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display font-semibold flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-primary" /> Per-Platform Strictness
        </h3>
        <p className="text-sm text-muted-foreground font-tech">
          Tune how strict the firewall is for each platform. Higher strictness lowers
          the similarity threshold and requires AI disclosure.
        </p>
      </div>

      {error && <p className="text-sm text-destructive font-tech">{error}</p>}

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-tech text-muted-foreground">Platform</label>
              <Input
                placeholder="e.g. etsy, gumroad, tiktok"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-tech text-muted-foreground">Strictness</label>
              <select
                value={form.strictness}
                onChange={(e) => setForm({ ...form, strictness: e.target.value })}
                className="w-full h-10 rounded-md bg-background border border-border/40 px-3 text-sm font-tech"
              >
                {POLICY_STRICTNESS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-tech text-muted-foreground">
                Similarity threshold (0–1)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.similarityThreshold}
                onChange={(e) =>
                  setForm({ ...form, similarityThreshold: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-tech text-muted-foreground">
                Prohibited keywords (comma-separated)
              </label>
              <Input
                placeholder="e.g. nft, crypto"
                value={form.prohibitedKeywords}
                onChange={(e) =>
                  setForm({ ...form, prohibitedKeywords: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-tech">
              <input
                type="checkbox"
                checked={form.aiContentAllowed}
                onChange={(e) =>
                  setForm({ ...form, aiContentAllowed: e.target.checked })
                }
              />
              AI content allowed
            </label>
            <label className="flex items-center gap-2 text-sm font-tech">
              <input
                type="checkbox"
                checked={form.disclosureRequired}
                onChange={(e) =>
                  setForm({ ...form, disclosureRequired: e.target.checked })
                }
              />
              Disclosure required
            </label>
          </div>
          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save policy
            </Button>
            {form.platform && (
              <Button
                variant="outline"
                onClick={() => setForm(EMPTY_POLICY)}
                disabled={saving}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground font-tech py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading policies…
        </div>
      ) : policies.length === 0 ? (
        <p className="text-sm text-muted-foreground font-tech">
          No custom platform policies yet — defaults apply.
        </p>
      ) : (
        <div className="space-y-2">
          {policies.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-semibold">{p.platform}</span>
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      {p.strictness}
                    </Badge>
                    {!p.aiContentAllowed && (
                      <Badge variant="outline" className="border-destructive/30 text-destructive">
                        AI blocked
                      </Badge>
                    )}
                    {p.disclosureRequired && (
                      <Badge variant="outline" className="border-yellow-400/30 text-yellow-400">
                        disclosure
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-tech mt-1">
                    similarity ≥ {p.similarityThreshold}
                    {p.prohibitedKeywords?.length
                      ? ` · blocked: ${p.prohibitedKeywords.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => edit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function FirewallPanel() {
  const [sub, setSub] = useState<"queue" | "checks" | "policies">("queue");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1 rounded-xl bg-card border border-border/40 w-fit max-w-full overflow-x-auto">
        {[
          { key: "queue" as const, label: "Review Queue" },
          { key: "checks" as const, label: "Recent Checks" },
          { key: "policies" as const, label: "Platform Policies" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-tech transition-all min-h-[40px] whitespace-nowrap ${
              sub === t.key
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "queue" && <ReviewQueue />}
      {sub === "checks" && <RecentChecks />}
      {sub === "policies" && <PolicyConfigSection />}
    </div>
  );
}
