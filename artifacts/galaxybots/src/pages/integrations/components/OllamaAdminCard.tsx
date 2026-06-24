import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Cpu, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OllamaConfig {
  enabled: boolean;
  model: string;
  host: string;
  connected: boolean;
}

export function OllamaAdminCard() {
  const qc = useQueryClient();
  const [editModel, setEditModel] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editing, setEditing] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: config, isLoading } = useQuery<OllamaConfig>({
    queryKey: ["admin", "ollama-config"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/ollama/config`);
      if (!res.ok) throw new Error("Failed to fetch Ollama config");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<OllamaConfig>) => {
      const res = await fetch(`${BASE}/api/admin/ollama/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update Ollama config");
      return res.json() as Promise<OllamaConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "ollama-config"] });
      setEditing(false);
    },
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${BASE}/api/admin/ollama/test`, { method: "POST" });
      const data = await res.json() as { connected: boolean };
      setTestResult(data);
    } catch {
      setTestResult({ connected: false });
    } finally {
      setTesting(false);
    }
  };

  const handleStartEdit = () => {
    setEditModel(config?.model ?? "llama3.2:3b");
    setEditHost(config?.host ?? "localhost:11434");
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({ model: editModel, host: editHost });
  };

  const ConnectionStatus = () => {
    const connected = testResult !== null ? testResult.connected : config?.connected;
    if (isLoading) return <Badge variant="outline" className="text-xs text-muted-foreground">Checking…</Badge>;
    if (connected) return (
      <Badge variant="outline" className="text-xs text-green-400 border-green-400/30 bg-green-400/5 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </Badge>
    );
    return (
      <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30 bg-amber-400/5 gap-1">
        <XCircle className="w-3 h-3" /> Unreachable
      </Badge>
    );
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-tech flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Local Model Router (Ollama)
          </CardTitle>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            {config && (
              <div className="flex items-center gap-2">
                <Switch
                  id="ollama-enabled"
                  checked={config.enabled}
                  onCheckedChange={(v) => updateMutation.mutate({ enabled: v })}
                  disabled={updateMutation.isPending}
                />
                <Label htmlFor="ollama-enabled" className="text-xs text-muted-foreground sr-only">Enabled</Label>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Routes coordinator and conductor reasoning to a self-hosted Ollama model — cost $0 per call.
          Fallback to efficient cloud models when unavailable.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground font-tech">Model</p>
                <p className="text-sm font-mono mt-0.5">{config?.model ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-tech">Host</p>
                <p className="text-sm font-mono mt-0.5">{config?.host ?? "—"}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={handleStartEdit} className="text-xs">
                Configure
              </Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="text-xs gap-1.5">
                <RefreshCw className={`w-3 h-3 ${testing ? "animate-spin" : ""}`} />
                Test Connection
              </Button>
            </div>
            {testResult !== null && !testResult.connected && (
              <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded p-2 mt-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Ollama not reachable at <code className="font-mono">{config?.host}</code>. Coordinator calls will fall back to the efficient cloud tier automatically.</span>
              </div>
            )}
            {testResult !== null && testResult.connected && (
              <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/5 border border-green-400/20 rounded p-2 mt-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Ollama is reachable. Coordinator calls will use the local <code className="font-mono">{config?.model}</code> model.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-tech">Model</Label>
              <Input
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                placeholder="llama3.2:3b"
                className="h-8 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">e.g. llama3.2:3b, phi3:mini, mistral:7b</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-tech">Host</Label>
              <Input
                value={editHost}
                onChange={(e) => setEditHost(e.target.value)}
                placeholder="localhost:11434"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="text-xs">
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="text-xs">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
