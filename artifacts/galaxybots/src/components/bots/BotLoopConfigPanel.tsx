import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings2, Save, RotateCcw, Zap, DollarSign, Target, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LoopConfig {
  id?: number;
  botId: number;
  clientId: number | null;
  isDefault: boolean;
  maxIterations: number;
  timeBudgetMs: number;
  costBudgetCents: number;
  qualityThreshold: number;
  enableSelfEvaluation: boolean;
  enableBrowserAgent: boolean;
  model: string;
  fallbackModel: string | null;
  networkAllowList: string[];
  updatedAt?: string;
}

interface FormState {
  maxIterations: string;
  timeBudgetMs: string;
  costBudgetCents: string;
  qualityThreshold: string;
  enableSelfEvaluation: boolean;
  enableBrowserAgent: boolean;
  model: string;
  fallbackModel: string;
  networkAllowList: string;
}

function configToForm(config: LoopConfig): FormState {
  return {
    maxIterations: String(config.maxIterations),
    timeBudgetMs: String(config.timeBudgetMs),
    costBudgetCents: String(config.costBudgetCents),
    qualityThreshold: String(config.qualityThreshold),
    enableSelfEvaluation: config.enableSelfEvaluation,
    enableBrowserAgent: config.enableBrowserAgent,
    model: config.model,
    fallbackModel: config.fallbackModel ?? "",
    networkAllowList: (config.networkAllowList ?? []).join(", "),
  };
}

async function fetchLoopConfig(botId: number, token: string | null): Promise<LoopConfig> {
  const res = await fetch(`${BASE}/api/bots/${botId}/loop-config`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch loop config");
  return res.json() as Promise<LoopConfig>;
}

async function saveLoopConfig(
  botId: number,
  token: string | null,
  body: Record<string, unknown>
): Promise<LoopConfig> {
  const res = await fetch(`${BASE}/api/bots/${botId}/loop-config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(err.error ?? "Failed to save loop config");
  }
  return res.json() as Promise<LoopConfig>;
}

export function BotLoopConfigPanel({ botId, botName }: { botId: number; botName: string }) {
  const { user } = useAuth();
  const token = localStorage.getItem("auth_token");
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery<LoopConfig>({
    queryKey: ["bot-loop-config", botId],
    queryFn: () => fetchLoopConfig(botId, token),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (config && !dirty) {
      setForm(configToForm(config));
    }
  }, [config, dirty]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => saveLoopConfig(botId, token, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(["bot-loop-config", botId], updated);
      setDirty(false);
      setSaveError(null);
    },
    onError: (err: Error) => {
      setSaveError(err.message);
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
    setDirty(true);
    setSaveError(null);
  }

  function handleReset() {
    if (config) {
      setForm(configToForm(config));
      setDirty(false);
      setSaveError(null);
    }
  }

  function handleSave() {
    if (!form) return;

    const maxIterations = parseInt(form.maxIterations);
    const timeBudgetMs = parseInt(form.timeBudgetMs);
    const costBudgetCents = parseInt(form.costBudgetCents);
    const qualityThreshold = parseFloat(form.qualityThreshold);
    const networkAllowList = form.networkAllowList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (isNaN(maxIterations) || maxIterations < 1 || maxIterations > 100) {
      setSaveError("Max iterations must be between 1 and 100");
      return;
    }
    if (isNaN(timeBudgetMs) || timeBudgetMs < 1000 || timeBudgetMs > 600000) {
      setSaveError("Time budget must be between 1000ms and 600000ms");
      return;
    }
    if (isNaN(costBudgetCents) || costBudgetCents < 0 || costBudgetCents > 100000) {
      setSaveError("Cost budget must be between 0 and 100000 cents");
      return;
    }
    if (isNaN(qualityThreshold) || qualityThreshold < 0 || qualityThreshold > 1) {
      setSaveError("Quality threshold must be between 0 and 1");
      return;
    }
    if (!form.model.trim()) {
      setSaveError("Model is required");
      return;
    }

    mutation.mutate({
      maxIterations,
      timeBudgetMs,
      costBudgetCents,
      qualityThreshold,
      enableSelfEvaluation: form.enableSelfEvaluation,
      enableBrowserAgent: form.enableBrowserAgent,
      model: form.model.trim(),
      fallbackModel: form.fallbackModel.trim() || null,
      networkAllowList,
    });
  }

  const isAdmin = user?.role === "owner" || user?.role === "admin";

  if (!isAdmin) {
    return (
      <Card className="border-border/40">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Only admins can view or edit loop configuration.
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Agentic Loop Config — {botName}
            </CardTitle>
            <div className="flex items-center gap-2">
              {config?.isDefault ? (
                <Badge variant="outline" className="text-[10px] font-tech text-muted-foreground">
                  Using defaults
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-tech text-cyan border-cyan/30 bg-cyan/5">
                  Custom config
                </Badge>
              )}
              {config?.updatedAt && (
                <span className="text-[10px] font-tech text-muted-foreground">
                  Updated {new Date(config.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-tech flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-primary" />
                Max Iterations
              </Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.maxIterations}
                onChange={(e) => update("maxIterations", e.target.value)}
                className="bg-secondary/50 border-border font-tech text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground">Maximum agentic loop cycles (1–100)</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-tech flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-muted-foreground" />
                Time Budget (ms)
              </Label>
              <Input
                type="number"
                min={1000}
                max={600000}
                step={1000}
                value={form.timeBudgetMs}
                onChange={(e) => update("timeBudgetMs", e.target.value)}
                className="bg-secondary/50 border-border font-tech text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Wall-clock timeout: {Math.round(parseInt(form.timeBudgetMs) / 1000 || 0)}s
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-tech flex items-center gap-1.5">
                <DollarSign className="w-3 h-3 text-green-400" />
                Cost Budget (cents)
              </Label>
              <Input
                type="number"
                min={0}
                max={100000}
                value={form.costBudgetCents}
                onChange={(e) => update("costBudgetCents", e.target.value)}
                className="bg-secondary/50 border-border font-tech text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Max LLM cost per run: ${((parseInt(form.costBudgetCents) || 0) / 100).toFixed(2)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-tech flex items-center gap-1.5">
                <Target className="w-3 h-3 text-cyan" />
                Quality Threshold
              </Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.qualityThreshold}
                onChange={(e) => update("qualityThreshold", e.target.value)}
                className="bg-secondary/50 border-border font-tech text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Minimum quality score to accept output (0–1)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-tech">Primary Model</Label>
              <Input
                type="text"
                placeholder="gpt-4o-mini"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                className="bg-secondary/50 border-border font-tech text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground">OpenAI model identifier</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-tech">Fallback Model</Label>
              <Input
                type="text"
                placeholder="gpt-3.5-turbo (optional)"
                value={form.fallbackModel}
                onChange={(e) => update("fallbackModel", e.target.value)}
                className="bg-secondary/50 border-border font-tech text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground">Used if primary model fails</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              form.enableSelfEvaluation ? "bg-secondary/20 border-border/40" : "bg-secondary/10 border-border/20"
            )}>
              <div>
                <p className="text-xs font-tech font-medium">Self-Evaluation</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Bot scores its own output before finalizing
                </p>
              </div>
              <Switch
                checked={form.enableSelfEvaluation}
                onCheckedChange={(v) => update("enableSelfEvaluation", v)}
              />
            </div>

            <div className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              form.enableBrowserAgent ? "bg-secondary/20 border-border/40" : "bg-secondary/10 border-border/20"
            )}>
              <div>
                <p className="text-xs font-tech font-medium">Browser Agent</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Allow bot to browse the web during execution
                </p>
              </div>
              <Switch
                checked={form.enableBrowserAgent}
                onCheckedChange={(v) => update("enableBrowserAgent", v)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-tech flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-muted-foreground" />
              Network Allow List
            </Label>
            <Input
              type="text"
              placeholder="api.example.com, data.acme.org"
              value={form.networkAllowList}
              onChange={(e) => update("networkAllowList", e.target.value)}
              className="bg-secondary/50 border-border font-tech text-sm h-9"
            />
            <p className="text-[10px] text-muted-foreground">
              Comma-separated hostnames the browser agent may access. Leave blank to allow all.
            </p>
          </div>

          {saveError && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 font-tech">
              {saveError}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="glow"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || mutation.isPending}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Changes
            </Button>

            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={mutation.isPending}
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </Button>
            )}

            {mutation.isSuccess && !dirty && (
              <span className="text-xs font-tech text-green-400">
                Config saved — takes effect on next loop execution
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
