import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Loader2, ArrowLeft, Building, Zap, ExternalLink, BarChart3, Globe, Save, Briefcase, MapPin } from "lucide-react";
import { AeoIntelligenceTab } from "./AeoIntelligenceTab";
import { useState, useEffect } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Client {
  id: number;
  companyName: string;
  contactName: string;
  contactEmail: string;
  plan: string;
  status: string;
  websiteUrl?: string | null;
  industry?: string | null;
  servicesList?: string[] | null;
  targetMarket?: string | null;
  businessContext?: string | null;
  createdAt: string;
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Client not found");
      return res.json();
    },
    enabled: !isNaN(clientId),
  });

  const [tab, setTab] = useState<"intelligence" | "profile">("intelligence");
  const [editContext, setEditContext] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editMarket, setEditMarket] = useState("");
  const [editServices, setEditServices] = useState("");

  useEffect(() => {
    if (client) {
      setEditContext(client.businessContext || "");
      setEditWebsite(client.websiteUrl || "");
      setEditIndustry(client.industry || "");
      setEditMarket(client.targetMarket || "");
      setEditServices(client.servicesList?.join(", ") || "");
    }
  }, [client]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Client> & { servicesList?: string[] }) => {
      const res = await fetch(`${BASE}/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
    },
  });

  const handleSaveProfile = () => {
    updateMutation.mutate({
      websiteUrl: editWebsite || null,
      industry: editIndustry || null,
      targetMarket: editMarket || null,
      servicesList: editServices ? editServices.split(",").map((s) => s.trim()).filter(Boolean) : null,
      businessContext: editContext || null,
    });
  };

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
            <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
              <Building className="text-primary w-8 h-8" />
              {client.companyName}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Badge variant={
                client.status === 'active' ? 'cyan' :
                client.status === 'trial' ? 'outline' : 'secondary'
              }>
                {client.status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase text-gold border-gold/30 bg-gold/5">
                {client.plan} TIER
              </Badge>
              {client.industry && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  <Briefcase className="w-3 h-3 mr-1" />
                  {client.industry}
                </Badge>
              )}
              {client.targetMarket && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  <MapPin className="w-3 h-3 mr-1" />
                  {client.targetMarket}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-sm text-muted-foreground font-tech space-y-1">
            <div>Contact: <span className="text-foreground">{client.contactName}</span></div>
            <div>Email: <span className="text-foreground">{client.contactEmail}</span></div>
            {client.websiteUrl && (
              <div className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                <a href={client.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {client.websiteUrl}
                </a>
              </div>
            )}
          </div>
        </div>

        {client.servicesList && client.servicesList.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {client.servicesList.map((service, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-tech">
                {service}
              </Badge>
            ))}
          </div>
        )}

        <div className="mb-6">
          <div className="flex gap-1 p-1 rounded-xl bg-card border border-border/40 w-fit">
            <button
              onClick={() => setTab("intelligence")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                tab === "intelligence"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Zap className="w-4 h-4" />
              AEO Intelligence
            </button>
            <button
              onClick={() => setTab("profile")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                tab === "profile"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Building className="w-4 h-4" />
              Business Profile
            </button>
            <Link href={`/clients/${clientId}/roi`}>
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                <BarChart3 className="w-4 h-4" />
                Value Report
              </div>
            </Link>
          </div>
        </div>

        {tab === "intelligence" && <AeoIntelligenceTab clientId={clientId} />}

        {tab === "profile" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-display">Company Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Website URL</label>
                  <Input
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Industry</label>
                  <Input
                    value={editIndustry}
                    onChange={(e) => setEditIndustry(e.target.value)}
                    placeholder="e.g. Landscaping & Snow Removal"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Target Market</label>
                  <Input
                    value={editMarket}
                    onChange={(e) => setEditMarket(e.target.value)}
                    placeholder="e.g. London, Ontario, Canada"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Services (comma-separated)</label>
                  <Input
                    value={editServices}
                    onChange={(e) => setEditServices(e.target.value)}
                    placeholder="e.g. Lawn Care, Snow Removal, Hardscaping"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-display">Bot Briefing Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Business Context</label>
                  <p className="text-xs text-muted-foreground">
                    This text is automatically injected into every bot's system prompt when working on missions for this client.
                  </p>
                  <Textarea
                    value={editContext}
                    onChange={(e) => setEditContext(e.target.value)}
                    placeholder="Describe the company, its services, market position, and any context bots should know..."
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
                <Button
                  onClick={handleSaveProfile}
                  disabled={updateMutation.isPending}
                  variant="glow"
                  className="w-full font-tech"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {updateMutation.isSuccess ? "SAVED" : "SAVE PROFILE"}
                </Button>
                {updateMutation.isError && (
                  <p className="text-destructive text-xs text-center">Failed to save. Please try again.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
