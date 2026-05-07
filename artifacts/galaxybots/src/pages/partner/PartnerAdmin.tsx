import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Copy, Check, Palette } from "lucide-react";
import { API_BASE } from "./components/types";

export default function PartnerAdmin() {
  const [activeTab, setActiveTab] = useState<"clients" | "branding">("clients");
  const { data: clients = [] } = useQuery<Array<{ id: number; companyName: string; contactName: string; contactEmail: string; plan: string; status: string; registeredAt: string }>>({
    queryKey: ["partner-clients"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/clients`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
  });

  return (
    <AppLayout>
      <div />
    </AppLayout>
  );
}
