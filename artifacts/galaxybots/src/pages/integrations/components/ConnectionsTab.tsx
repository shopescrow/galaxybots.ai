import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { SERVICES } from "./constants";
import { API_BASE, type Integration } from "./types";
import { IntegrationCard } from "./IntegrationCard";

interface Props {
  clientId: number;
}

export function ConnectionsTab({ clientId }: Props) {
  const [highlightedService] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight");
  });

  useEffect(() => {
    if (highlightedService) {
      const el = document.getElementById(`integration-${highlightedService}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedService]);

  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ["client-integrations", clientId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/client-integrations/${clientId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!clientId,
  });

  const integrationMap = new Map(integrations.map((i) => [i.service, i]));

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="font-semibold text-sm mb-1">Platform-Level Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Slack and Linear are shared across all clients and configured at the platform level via environment variables (SLACK_BOT_TOKEN, LINEAR_API_KEY). Contact your administrator to set these up.
        </p>
      </div>

      <div className="grid gap-4">
        {SERVICES.map((service) => (
          <div
            key={service.key}
            id={`integration-${service.key}`}
            className={highlightedService === service.key ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl transition-all" : ""}
          >
            <ErrorBoundary>
              <IntegrationCard
                service={service}
                existing={integrationMap.get(service.key)}
                clientId={clientId}
              />
            </ErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}
