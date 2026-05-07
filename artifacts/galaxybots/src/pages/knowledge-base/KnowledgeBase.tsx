import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { API_BASE } from "@/pages/integrations/components/types";

export default function KnowledgeBase() {
  const [clientId, setClientId] = useState<number>(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: clients = [] } = useQuery<Array<{ id: number; companyName: string }>>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/clients`, { credentials: "include" });
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
  });

  useEffect(() => {
    if (clients.length > 0 && !clients.find(c => c.id === clientId)) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  return <AppLayout><div /></AppLayout>;
}
