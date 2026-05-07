import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Key, Copy, Check, Trash2, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoginGate } from "./LoginGate";
import type { DevKey } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newScopes, setNewScopes] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          label: newLabel || "default",
          scopes: newScopes.split(",").map(s => s.trim()),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.apiKey);
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/developer/keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer", "keys"] });
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
    <LoginGate message="Sign in to generate and manage your developer API keys.">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold">API Keys</h2>
          <Badge variant="outline" className="font-tech text-xs">
            {keys?.filter(k => k.status === "active").length ?? 0} active
          </Badge>
        </div>

        {createdKey && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-bold text-primary">New API Key Created — copy it now, it won't be shown again</p>
              <div className="flex gap-2">
                <Input value={createdKey} readOnly className="text-xs font-mono" />
                <Button size="sm" variant="outline" onClick={copyKey}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key label (e.g. production-app)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="text-xs flex-1"
              />
              <Select value={newScopes} onValueChange={setNewScopes}>
                <SelectTrigger className="w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="read,write">Read + Write</SelectItem>
                  <SelectItem value="read,write,admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => createKey.mutate()} disabled={createKey.isPending}>
                {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4 mr-1" />}
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys && keys.length > 0 ? (
          <div className="space-y-2">
            {keys.map((k) => (
              <Card key={k.id} className={`border-border/50 ${k.status === "revoked" ? "opacity-50" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{k.label}</span>
                        <Badge variant={k.status === "active" ? "default" : "destructive"} className="text-[10px]">
                          {k.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {k.tier}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{k.keyPrefix}...</span>
                        <span>Scopes: {k.scopes.join(", ")}</span>
                        <span>Calls: {k.totalCalls.toLocaleString()}</span>
                        <span>Limit: {k.rateLimit.toLocaleString()}/day</span>
                      </div>
                    </div>
                    {k.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => revokeKey.mutate(k.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No API keys yet. Create one to get started.
          </div>
        )}
      </div>
    </LoginGate>
  );
}
