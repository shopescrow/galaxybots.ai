import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Key, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { BASE } from "./types";

export function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys } = useQuery<{ id: number; label: string; apiKeyPrefix: string; createdAt: string }[]>({
    queryKey: ["analytics", "api-keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/api-keys`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newKeyLabel || "default" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.apiKey);
      setNewKeyLabel("");
      queryClient.invalidateQueries({ queryKey: ["analytics", "api-keys"] });
    },
  });

  const deleteKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/analytics/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics", "api-keys"] });
    },
  });

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4" />
          Analytics API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Generate read-only API keys for data science teams to query analytics programmatically.
        </p>

        {createdKey && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-bold text-primary">New API Key Created (copy now, it won't be shown again)</p>
            <div className="flex gap-2">
              <Input value={createdKey} readOnly className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={copyKey}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Key label (e.g. data-team)"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            className="text-xs"
          />
          <Button size="sm" onClick={() => createKey.mutate()} disabled={createKey.isPending}>
            {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          </Button>
        </div>

        {keys && keys.length > 0 && (
          <div className="space-y-1">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/50">
                <div>
                  <span className="font-bold">{k.label}</span>
                  <span className="text-muted-foreground ml-2">{k.apiKeyPrefix}...</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => deleteKey.mutate(k.id)}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
