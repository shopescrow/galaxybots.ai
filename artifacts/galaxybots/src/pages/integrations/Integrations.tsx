import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Link2, Wrench } from "lucide-react";
import { API_BASE } from "./components/types";

const ConnectionsTab = lazy(() => import("./components/ConnectionsTab").then(m => ({ default: m.ConnectionsTab })));
const PlatformToolsTab = lazy(() => import("./components/PlatformToolsTab").then(m => ({ default: m.PlatformToolsTab })));

function TabFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function Integrations() {
  const [clientId, setClientId] = useState<number>(1);

  const { data: clients } = useQuery<Array<{ id: number; companyName: string }>>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/clients`);
      return res.json();
    },
  });

  useEffect(() => {
    if (clients && clients.length > 0 && !clients.find((c) => c.id === clientId)) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect your accounts so agents can perform actions on your behalf — send emails, manage calendar events, update CRM records, and create documents.
          </p>
        </div>

        {clients && clients.length > 1 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Client:</label>
            <select
              className="rounded border px-3 py-1.5 text-sm bg-background text-foreground border-border min-w-[200px]"
              value={clientId}
              onChange={(e) => setClientId(Number(e.target.value))}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>
        )}

        <Tabs defaultValue="connections" className="space-y-6">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1 bg-secondary/50">
            <TabsTrigger value="connections" className="text-xs gap-1">
              <Link2 className="w-3 h-3" /> Connections
            </TabsTrigger>
            <TabsTrigger value="platform-tools" className="text-xs gap-1">
              <Wrench className="w-3 h-3" /> Platform Tools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connections">
            <ErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <ConnectionsTab clientId={clientId} />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="platform-tools">
            <ErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <PlatformToolsTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
