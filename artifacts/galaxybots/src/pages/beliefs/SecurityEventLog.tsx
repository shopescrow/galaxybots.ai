import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Eye,
  Loader2,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api/v1${path}`; }

interface SecurityEvent {
  id: number;
  eventType: string;
  source: string;
  contentHash: string | null;
  disposition: string;
  botId: number | null;
  clientId: number | null;
  sessionId: number | null;
  detectionPatterns: string[];
  adversarialScore: number | null;
  rawContentPreview: string | null;
  reviewedAt: string | null;
  reviewedByUserId: number | null;
  createdAt: string;
}

const DISPOSITION_STYLES: Record<string, string> = {
  quarantined: "bg-red-100 text-red-800 border-red-200",
  sanitized: "bg-yellow-100 text-yellow-800 border-yellow-200",
  clean: "bg-green-100 text-green-800 border-green-200",
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-red-100 text-red-800" : pct >= 40 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>Score: {pct}%</span>;
}

export default function SecurityEventLog() {
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery<SecurityEvent[]>({
    queryKey: ["security-events", unreviewedOnly],
    queryFn: async () => {
      const params = unreviewedOnly ? "?unreviewed=true" : "";
      const res = await fetch(apiUrl(`/admin/security-events${params}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load security events");
      return res.json() as Promise<SecurityEvent[]>;
    },
    refetchInterval: 30_000,
  });

  const reviewMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(apiUrl(`/admin/security-events/${id}/review`), {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark reviewed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["security-events"] });
      toast({ title: "Event marked as reviewed" });
    },
  });

  const unreviewedCount = events.filter((e) => !e.reviewedAt).length;
  const quarantinedCount = events.filter((e) => e.disposition === "quarantined").length;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Security Event Log</h1>
            <p className="text-muted-foreground text-sm">Adversarial input quarantine and sanitization audit trail</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{events.length}</div>
              <div className="text-sm text-muted-foreground">Total Events</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{quarantinedCount}</div>
              <div className="text-sm text-muted-foreground">Quarantined</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">{unreviewedCount}</div>
              <div className="text-sm text-muted-foreground">Pending Review</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Switch
            id="unreviewed-toggle"
            checked={unreviewedOnly}
            onCheckedChange={setUnreviewedOnly}
          />
          <Label htmlFor="unreviewed-toggle" className="text-sm cursor-pointer">
            Show unreviewed only
          </Label>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading events…
          </div>
        ) : events.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
              <p className="font-medium">No security events</p>
              <p className="text-muted-foreground text-sm mt-1">
                {unreviewedOnly ? "All events have been reviewed" : "No adversarial inputs detected yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <Card
                key={event.id}
                className={`cursor-pointer transition-colors ${event.disposition === "quarantined" ? "border-red-200" : ""} ${!event.reviewedAt ? "border-l-4 border-l-yellow-400" : ""}`}
                onClick={() => setExpanded(expanded === event.id ? null : event.id)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${DISPOSITION_STYLES[event.disposition] ?? ""}`}>
                          {event.disposition === "quarantined" && <Lock className="h-3 w-3 mr-1" />}
                          {event.disposition}
                        </span>
                        <ScoreBadge score={event.adversarialScore} />
                        <span className="text-xs text-muted-foreground font-mono">{event.source}</span>
                        {event.botId && <span className="text-xs text-muted-foreground">Bot #{event.botId}</span>}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(event.createdAt))} ago
                        </span>
                      </div>

                      {expanded === event.id && (
                        <div className="mt-3 space-y-2 text-sm">
                          {event.rawContentPreview && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Content Preview</p>
                              <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap">{event.rawContentPreview}</pre>
                            </div>
                          )}
                          {event.detectionPatterns.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Detection Patterns</p>
                              <div className="flex flex-wrap gap-1">
                                {event.detectionPatterns.map((p, i) => (
                                  <Badge key={i} variant="outline" className="text-xs font-mono">{p}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {event.contentHash && (
                            <p className="text-xs text-muted-foreground">Hash: <span className="font-mono">{event.contentHash}</span></p>
                          )}
                          {event.reviewedAt && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Reviewed {format(new Date(event.reviewedAt), "MMM d, yyyy HH:mm")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!event.reviewedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); reviewMutation.mutate(event.id); }}
                          disabled={reviewMutation.isPending}
                        >
                          <Eye className="h-3 w-3 mr-1" /> Mark Reviewed
                        </Button>
                      )}
                      {event.reviewedAt && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
