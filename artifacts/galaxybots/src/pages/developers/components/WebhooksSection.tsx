import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Check, ChevronDown, ChevronRight, AlertTriangle, Loader2, Send } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WebhookEvent } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function WebhooksSection() {
  const { user } = useAuth();
  const [testUrl, setTestUrl] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("task_session.completed");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const { data: events } = useQuery<WebhookEvent[]>({
    queryKey: ["developer", "webhook-events"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/webhook-events`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/developer/webhook-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: testUrl, eventType: selectedEvent }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => setTestResult(data),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">Webhook Events</h2>
      <p className="text-sm text-muted-foreground">
        GalaxyBots fires outbound webhook events when key actions occur. Register a URL to receive notifications in real time.
      </p>

      <div className="space-y-2">
        {events?.map((ev) => (
          <Card key={ev.eventType} className="border-border/50">
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedEvent(expandedEvent === ev.eventType ? null : ev.eventType)}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">{ev.eventType}</Badge>
                  <span className="text-xs text-muted-foreground">{ev.description}</span>
                </div>
                {expandedEvent === ev.eventType ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
              {expandedEvent === ev.eventType && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground mb-1 block">Sample Payload</Label>
                  <pre className="bg-secondary/80 border border-border/50 rounded-lg p-3 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {user ? (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-tech uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Send className="w-4 h-4" />
              Test Webhook Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Fire a sample webhook payload to your endpoint to test your integration.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="https://your-server.com/webhook"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="text-xs flex-1"
              />
              <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                <SelectTrigger className="w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task_session.completed">task_session.completed</SelectItem>
                  <SelectItem value="pipeline.triggered">pipeline.triggered</SelectItem>
                  <SelectItem value="bot.alert">bot.alert</SelectItem>
                  <SelectItem value="lead.received">lead.received</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !testUrl}
              >
                {sendTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Send Test
              </Button>
            </div>

            {testResult && (
              <div className={`rounded-lg border p-3 ${testResult.success ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs font-bold">
                    {testResult.success ? `Delivered — ${testResult.statusCode} ${testResult.statusText}` : `Failed — ${testResult.error}`}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Sign in to test webhook delivery to your endpoints.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
