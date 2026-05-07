import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Bookmark, Trash2, Play, RefreshCw, Bot, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AskQueryPayload {
  output: "table" | "chart" | "summary";
  columns?: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  aggregate?: { op: string; value: number; groupBy?: { key: string; value: number }[] } | null;
  summary?: string;
}

interface AskResponseQuery {
  kind: "query";
  dsl: unknown;
  payload: AskQueryPayload;
}

interface AskResponseMutation {
  kind: "mutation";
  dsl: unknown;
  requiresConfirm: true;
  matchedCount: number;
  explanation: string;
}

type AskResponse = AskResponseQuery | AskResponseMutation;

interface SavedView {
  id: number;
  name: string;
  question: string | null;
  dsl: unknown;
  pinned: boolean;
}

interface Insight {
  id: number;
  kind: string;
  severity: "info" | "warn" | "alert";
  title: string;
  body: string;
  observedAt: string;
}

interface StewardBot {
  id: number;
  name: string;
  title: string;
  description: string | null;
}

const apiBase = "/api/v1";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function CrmAskCard({ crmId }: { crmId: number }) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [steward, setSteward] = useState<StewardBot | null>(null);

  async function refreshSidebar() {
    try {
      const [v, i, s] = await Promise.all([
        api<SavedView[]>(`/liberator/crms/${crmId}/views`),
        api<Insight[]>(`/liberator/crms/${crmId}/insights?limit=10`),
        api<{ bot: StewardBot | null }>(`/liberator/crms/${crmId}/steward`),
      ]);
      setViews(v);
      setInsights(i);
      setSteward(s.bot);
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    refreshSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmId]);

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const resp = await api<AskResponse>(`/liberator/crms/${crmId}/ask`, {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      setAnswer(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMutation() {
    if (!answer || answer.kind !== "mutation") return;
    setExecuting(true);
    try {
      const resp = await api<{ affected: number }>(`/liberator/crms/${crmId}/ask/execute`, {
        method: "POST",
        body: JSON.stringify({ dsl: answer.dsl, expectedCount: answer.matchedCount }),
      });
      toast({ title: "Bulk action applied", description: `${resp.affected} record(s) updated.` });
      setAnswer(null);
      setQuestion("");
    } catch (e) {
      toast({ title: "Bulk action failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setExecuting(false);
    }
  }

  async function saveAsView() {
    if (!answer || answer.kind !== "query") return;
    const name = window.prompt("Name this view:", question.slice(0, 60) || "Saved view");
    if (!name) return;
    try {
      await api<SavedView>(`/liberator/crms/${crmId}/views`, {
        method: "POST",
        body: JSON.stringify({ name, question, dsl: answer.dsl, pinned: true }),
      });
      toast({ title: "View saved" });
      refreshSidebar();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }

  async function runView(viewId: number) {
    setBusy(true);
    setAnswer(null);
    setError(null);
    try {
      const resp = await api<{ payload: AskQueryPayload; view: SavedView }>(`/liberator/crms/${crmId}/views/${viewId}/run`, { method: "POST" });
      setQuestion(resp.view.question ?? resp.view.name);
      setAnswer({ kind: "query", dsl: resp.view.dsl, payload: resp.payload });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteView(viewId: number) {
    try {
      await api(`/liberator/crms/${crmId}/views/${viewId}`, { method: "DELETE" });
      refreshSidebar();
    } catch {
      // ignore
    }
  }

  async function runAnomalyChecks() {
    try {
      await api(`/liberator/crms/${crmId}/insights/run`, { method: "POST" });
      refreshSidebar();
    } catch (e) {
      toast({ title: "Insight check failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Ask this CRM
          </CardTitle>
          <CardDescription>
            Plain-English questions or bulk actions. Bulk changes always preview before applying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); ask(); }}
            className="flex gap-2"
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='e.g. "Top 10 deals by amount" or "Tag all leads from Acme as priority"'
              disabled={busy}
              data-testid="input-ask-question"
            />
            <Button type="submit" disabled={busy || !question.trim()} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Ask
            </Button>
          </form>

          {error && (
            <div className="text-sm text-destructive border border-destructive/40 bg-destructive/5 rounded-md p-3">
              {error}
            </div>
          )}

          {answer && answer.kind === "mutation" && (
            <div className="border border-amber-500/40 bg-amber-500/5 rounded-md p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-600 font-medium">
                <AlertTriangle className="w-4 h-4" /> Confirm bulk action
              </div>
              <p className="text-sm">{answer.explanation}</p>
              <pre className="text-xs bg-background/50 border border-border rounded p-2 overflow-x-auto">
                {JSON.stringify(answer.dsl, null, 2)}
              </pre>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={confirmMutation}
                  disabled={executing || answer.matchedCount === 0}
                  className="gap-2"
                  data-testid="button-confirm-mutation"
                >
                  {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Apply to {answer.matchedCount} record{answer.matchedCount === 1 ? "" : "s"}
                </Button>
                <Button variant="ghost" onClick={() => setAnswer(null)}>Cancel</Button>
              </div>
            </div>
          )}

          {answer && answer.kind === "query" && (
            <div className="space-y-3">
              {answer.payload.summary && (
                <div className="text-sm text-muted-foreground">{answer.payload.summary}</div>
              )}
              {answer.payload.output === "summary" && answer.payload.aggregate && (
                <div className="text-3xl font-bold">{answer.payload.aggregate.value.toLocaleString()}</div>
              )}
              {answer.payload.output === "chart" && answer.payload.aggregate?.groupBy && (
                <div className="space-y-1">
                  {answer.payload.aggregate.groupBy.slice(0, 12).map((g) => {
                    const max = Math.max(...answer.payload.aggregate!.groupBy!.map((x) => x.value));
                    const pct = max > 0 ? (g.value / max) * 100 : 0;
                    return (
                      <div key={g.key} className="flex items-center gap-2 text-sm">
                        <div className="w-32 truncate" title={g.key}>{g.key}</div>
                        <div className="flex-1 bg-secondary rounded h-3 overflow-hidden">
                          <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-16 text-right font-mono text-xs">{g.value.toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {answer.payload.output === "table" && answer.payload.rows.length > 0 && (
                <div className="border border-border rounded-md overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 sticky top-0">
                      <tr>
                        {(answer.payload.columns ?? Object.keys(answer.payload.rows[0])).map((c) => (
                          <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {answer.payload.rows.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          {(answer.payload.columns ?? Object.keys(r)).map((c) => (
                            <td key={c} className="px-3 py-2 align-top">
                              <span className="block max-w-[260px] truncate" title={String(r[c] ?? "")}>
                                {r[c] === null || r[c] === undefined ? <span className="text-muted-foreground italic">—</span> : String(r[c])}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {answer.payload.output === "table" && answer.payload.rows.length === 0 && (
                <div className="text-sm text-muted-foreground italic">No matching records.</div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  {answer.payload.totalRows.toLocaleString()} total
                </div>
                <Button variant="outline" size="sm" onClick={saveAsView} className="gap-2">
                  <Bookmark className="w-3 h-3" /> Save as view
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="w-4 h-4 text-primary" /> Steward
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {steward ? (
              <>
                <div className="font-semibold">{steward.name}</div>
                <div className="text-xs text-muted-foreground">{steward.title}</div>
                {steward.description && (
                  <p className="text-xs mt-2 text-muted-foreground line-clamp-3">{steward.description}</p>
                )}
              </>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                A steward bot is spawned automatically the first time this CRM is committed.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Insights
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={runAnomalyChecks} title="Re-run checks">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {insights.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No anomalies detected.</div>
            ) : (
              insights.map((i) => (
                <div key={i.id} className="border-l-2 pl-2 border-primary/40">
                  <div className="flex items-center gap-2">
                    <Badge variant={i.severity === "alert" ? "destructive" : i.severity === "warn" ? "outline" : "secondary"} className="text-[10px]">
                      {i.severity}
                    </Badge>
                    <div className="font-medium text-xs">{i.title}</div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{i.body}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {views.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bookmark className="w-4 h-4" /> Saved Views
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {views.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                  <button
                    onClick={() => runView(v.id)}
                    className="flex-1 text-left truncate hover:text-primary"
                    title={v.question ?? v.name}
                  >
                    {v.name}
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => deleteView(v.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
