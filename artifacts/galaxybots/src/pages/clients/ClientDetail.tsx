import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Loader2, ArrowLeft, Building, Zap, ExternalLink, BarChart3 } from "lucide-react";
import { AeoIntelligenceTab } from "./AeoIntelligenceTab";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Client {
  id: number;
  companyName: string;
  contactName: string;
  contactEmail: string;
  plan: string;
  status: string;
  createdAt: string;
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Client not found");
      return res.json();
    },
    enabled: !isNaN(clientId),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Client not found.</p>
          <Link href="/clients">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Clients
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/clients">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Building className="text-primary w-8 h-8" />
              {client.companyName}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant={
                client.status === 'active' ? 'cyan' :
                client.status === 'trial' ? 'outline' : 'secondary'
              }>
                {client.status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase text-gold border-gold/30 bg-gold/5">
                {client.plan} TIER
              </Badge>
            </div>
          </div>
          <div className="text-sm text-muted-foreground font-tech space-y-1">
            <div>Contact: <span className="text-foreground">{client.contactName}</span></div>
            <div>Email: <span className="text-foreground">{client.contactEmail}</span></div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex gap-1 p-1 rounded-xl bg-card border border-border/40 w-fit">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech bg-primary/20 text-primary border border-primary/30">
              <Zap className="w-4 h-4" />
              AEO Intelligence
            </div>
            <Link href={`/clients/${clientId}/roi`}>
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                <BarChart3 className="w-4 h-4" />
                Value Report
              </div>
            </Link>
          </div>
        </div>

        <AeoIntelligenceTab clientId={clientId} />
      </div>
    </AppLayout>
  );
}
