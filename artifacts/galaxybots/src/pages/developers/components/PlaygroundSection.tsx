import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Key, Loader2, Play, Shield } from "lucide-react";
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

export function PlaygroundSection() {
  const { user } = useAuth();
  const [method, setMethod] = useState("GET");
  const [endpoint, setEndpoint] = useState("/healthz");
  const [body, setBody] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [authMode, setAuthMode] = useState<"key" | "session">("key");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const { data: keys } = useQuery<DevKey[]>({
    queryKey: ["developer", "keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/keys`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const activeKeys = keys?.filter(k => k.status === "active") || [];

  const commonEndpoints = [
    { method: "GET", path: "/healthz", label: "Health Check" },
    { method: "GET", path: "/bots", label: "List Bots" },
    { method: "GET", path: "/clients", label: "List Clients" },
    { method: "GET", path: "/conversations", label: "List Conversations" },
    { method: "GET", path: "/task-sessions", label: "List Task Sessions" },
    { method: "GET", path: "/analytics/overview", label: "Analytics Overview" },
    { method: "GET", path: "/developer/changelog", label: "API Changelog" },
  ];

  const fireRequest = async () => {
    setLoading(true);
    setResponse(null);
    setStatus(null);
    setLatency(null);

    const start = Date.now();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authMode === "key" && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const opts: RequestInit = {
        method,
        headers,
      };

      if (authMode === "session") {
        opts.credentials = "include";
      }

      if (method !== "GET" && method !== "HEAD" && body) {
        opts.body = body;
      }
      const res = await fetch(`${BASE}/api${endpoint}`, opts);
      const elapsed = Date.now() - start;
      setLatency(elapsed);
      setStatus(res.status);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err) {
      setLatency(Date.now() - start);
      setResponse(err instanceof Error ? err.message : "Request failed");
      setStatus(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginGate message="Sign in to use the API playground and test endpoints with your API key.">
      <div className="space-y-4">
        <h2 className="text-xl font-display font-bold">API Playground</h2>
        <p className="text-sm text-muted-foreground">
          Test API endpoints directly in your browser. Use your developer API key for authentication.
        </p>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground">Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={authMode === "key" ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setAuthMode("key")}
              >
                <Key className="w-3 h-3 mr-1" /> API Key
              </Button>
              <Button
                variant={authMode === "session" ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setAuthMode("session")}
              >
                <Shield className="w-3 h-3 mr-1" /> Session
              </Button>
            </div>
            {authMode === "key" && (
              <div className="space-y-2">
                <Input
                  placeholder="Paste your gbdev_... API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="text-xs font-mono"
                  type="password"
                />
                {activeKeys.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    You have {activeKeys.length} active key{activeKeys.length > 1 ? "s" : ""}: {activeKeys.map(k => k.keyPrefix + "...").join(", ")}
                  </p>
                )}
              </div>
            )}
            {authMode === "session" && (
              <p className="text-xs text-muted-foreground">Using your current browser session for authentication.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 mb-4">
          {commonEndpoints.map((ep) => (
            <Button
              key={ep.path}
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => { setMethod(ep.method); setEndpoint(ep.path); setBody(""); }}
            >
              <span className="text-primary font-mono mr-1">{ep.method}</span>
              {ep.label}
            </Button>
          ))}
        </div>

        <Card className="border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-24 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1 flex items-center bg-secondary/50 rounded-md border border-border/50 px-3">
                <span className="text-xs text-muted-foreground font-mono">/api</span>
                <Input
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="border-0 bg-transparent text-xs font-mono shadow-none focus-visible:ring-0 pl-0"
                  placeholder="/endpoint"
                />
              </div>
              <Button onClick={fireRequest} disabled={loading} size="sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                Send
              </Button>
            </div>

            {method !== "GET" && method !== "HEAD" && (
              <div>
                <Label className="text-xs text-muted-foreground">Request Body (JSON)</Label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full h-24 mt-1 p-2 text-xs font-mono bg-secondary/50 border border-border/50 rounded-md resize-none"
                  placeholder='{ "key": "value" }'
                />
              </div>
            )}

            {response !== null && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant={status && status < 400 ? "default" : "destructive"}>
                    {status}
                  </Badge>
                  {latency !== null && (
                    <span className="text-muted-foreground">{latency}ms</span>
                  )}
                </div>
                <pre className="bg-secondary/80 border border-border/50 rounded-lg p-3 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                  {response}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LoginGate>
  );
}
