import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Loader2, ArrowLeft, Building, Zap, BarChart3, Globe, Save, Briefcase, MapPin, Crosshair, Rocket, Users, Heart, Phone, Sparkles, FileText, ExternalLink, Plus } from "lucide-react";
import { AeoIntelligenceTab } from "./AeoIntelligenceTab";
import { KnowledgeBaseTab } from "./KnowledgeBaseTab";
import { StakeholderAccessTab } from "./StakeholderAccessTab";
import { ClientHealthTab } from "./ClientHealthTab";
import { CallsTab } from "./CallsTab";
import { IntelligenceBriefingsTab } from "./IntelligenceBriefingsTab";
import { SCENARIOS, SCENARIO_CLIENTS } from "@/data/scenarios";
import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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

const DIFFICULTY_STYLES: Record<string, string> = {
  Tactical: "text-green-400 border-green-500/30 bg-green-500/10",
  Strategic: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  Critical: "text-red-400 border-red-500/30 bg-red-500/10",
};

const CLIENT_NAME_MAP: Record<string, string> = {
  "7 lawn 11": "7lawn11",
  "7lawn11": "7lawn11",
  "7 lawn11": "7lawn11",
  "lawn 11": "7lawn11",
  "family movers canada": "family-movers",
  "family movers": "family-movers",
  "familymoverscanada": "family-movers",
};

function findClientSlug(companyName: string): string | null {
  const normalized = companyName.toLowerCase().trim();
  if (CLIENT_NAME_MAP[normalized]) return CLIENT_NAME_MAP[normalized];
  for (const [key, slug] of Object.entries(CLIENT_NAME_MAP)) {
    if (normalized === key) return slug;
  }
  for (const c of SCENARIO_CLIENTS) {
    if (normalized === c.name.toLowerCase()) return c.slug;
  }
  return null;
}

const VALID_CLIENT_TABS = ["intelligence", "profile", "knowledge-base", "missions", "stakeholders", "health", "calls", "bingolingo", "briefings"] as const;
type ClientTab = typeof VALID_CLIENT_TABS[number];

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<ClientTab>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get("tab");
    return (VALID_CLIENT_TABS as readonly string[]).includes(tab ?? "") ? (tab as ClientTab) : "intelligence";
  });

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) throw new Error("Access denied");
      if (res.status === 404) throw new Error("Client not found");
      if (!res.ok) throw new Error("Failed to load client");
      return res.json();
    },
    enabled: !isNaN(clientId) && !!token,
  });

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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  const BINGOLINGO_API = `${BASE}/../api/bingolingo`.replace(/\/\//g, "/");

  const { data: bingolingoClient, isLoading: blLoading, error: blError, refetch: refetchBl } = useQuery<{
    id: number;
    name: string;
    slug: string;
    contentCount: number;
    latestContent: { id: number; title: string; type: string; status: string; createdAt: string } | null;
  } | null>({
    queryKey: ["bingolingo-client", clientId],
    queryFn: async () => {
      const res = await fetch(`${BINGOLINGO_API}/clients/by-galaxybots/${clientId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load BingoLingo data (${res.status})`);
      return res.json();
    },
    enabled: !!client,
    retry: false,
  });

  const createBlWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BINGOLINGO_API}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: client!.companyName,
          industry: client!.industry || "General",
          website: client!.websiteUrl || undefined,
          galaxybotsClientId: clientId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to create workspace");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchBl();
    },
  });

  const clientSlug = client ? findClientSlug(client.companyName) : null;
  const clientScenarios = clientSlug
    ? SCENARIOS.filter((s) => s.clientSlug === clientSlug)
    : [];

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
              <ClientBingoLingoBadge clientId={clientId} />
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
              onClick={() => setActiveTab("health")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "health"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Heart className="w-4 h-4" />
              Health Score
            </button>
            <button
              onClick={() => setActiveTab("intelligence")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "intelligence"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Zap className="w-4 h-4" />
              AEO Intelligence
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "profile"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Building className="w-4 h-4" />
              Business Profile
            </button>
            <button
              onClick={() => setActiveTab("knowledge-base")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "knowledge-base"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Knowledge Base
            </button>
            <Link href={`/clients/${clientId}/roi`}>
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
                <BarChart3 className="w-4 h-4" />
                Value Report
              </div>
            </Link>
            <button
              onClick={() => setActiveTab("calls")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "calls"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Phone className="w-4 h-4" />
              Calls
            </button>
            <button
              onClick={() => setActiveTab("stakeholders")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "stakeholders"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Users className="w-4 h-4" />
              Stakeholder Access
            </button>
            <button
              onClick={() => setActiveTab("bingolingo")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "bingolingo"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              BingoLingo
            </button>
            <button
              onClick={() => setActiveTab("briefings")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                activeTab === "briefings"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Zap className="w-4 h-4" />
              Briefings
            </button>
            {clientScenarios.length > 0 && (
              <button
                onClick={() => setActiveTab("missions")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all ${
                  activeTab === "missions"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Crosshair className="w-4 h-4" />
                Missions
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                  {clientScenarios.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {activeTab === "health" && <ClientHealthTab clientId={clientId} />}

        {activeTab === "intelligence" && <AeoIntelligenceTab clientId={clientId} />}

        {activeTab === "profile" && (
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

        {activeTab === "knowledge-base" && <KnowledgeBaseTab clientId={clientId} />}

        {activeTab === "calls" && <CallsTab clientId={clientId} />}

        {activeTab === "stakeholders" && <StakeholderAccessTab clientId={clientId} />}

        {activeTab === "bingolingo" && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30">
                <Sparkles className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-lg font-display">BingoLingo Content</CardTitle>
            </CardHeader>
            <CardContent>
              {blLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : blError ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-destructive text-sm">{blError.message}</p>
                  <Button variant="outline" size="sm" onClick={() => refetchBl()}>Retry</Button>
                </div>
              ) : bingolingoClient ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-lg border bg-background p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <FileText className="w-4 h-4" />
                        Content Pieces
                      </div>
                      <div className="text-2xl font-bold">{bingolingoClient.contentCount}</div>
                    </div>
                    <div className="rounded-lg border bg-background p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <FileText className="w-4 h-4" />
                        Latest Content
                      </div>
                      {bingolingoClient.latestContent ? (
                        <div>
                          <p className="font-medium text-sm truncate">{bingolingoClient.latestContent.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">{bingolingoClient.latestContent.type}</Badge>
                            <Badge variant={bingolingoClient.latestContent.status === "published" ? "default" : "secondary"} className="text-[10px]">
                              {bingolingoClient.latestContent.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(bingolingoClient.latestContent.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No content yet</p>
                      )}
                    </div>
                  </div>
                  <a href={`/bingolingo/clients/${bingolingoClient.id}`}>
                    <Button variant="glow" className="w-full font-tech gap-2">
                      <ExternalLink className="w-4 h-4" />
                      View in BingoLingo
                    </Button>
                  </a>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <div className="flex justify-center">
                    <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-amber-400" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">No BingoLingo workspace linked</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create a BingoLingo workspace for {client.companyName} to start generating AI-powered content.
                    </p>
                  </div>
                  <Button
                    variant="glow"
                    className="font-tech gap-2"
                    onClick={() => createBlWorkspaceMutation.mutate()}
                    disabled={createBlWorkspaceMutation.isPending}
                  >
                    {createBlWorkspaceMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Create BingoLingo Workspace
                  </Button>
                  {createBlWorkspaceMutation.isError && (
                    <p className="text-destructive text-xs">{createBlWorkspaceMutation.error?.message}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "briefings" && <IntelligenceBriefingsTab clientId={clientId} />}

        {activeTab === "missions" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {clientScenarios.map((scenario) => (
              <Card
                key={scenario.id}
                className="p-5 bg-black/30 border-primary/20 hover:border-primary/40 transition-all flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <Badge variant="outline" className="text-[10px]">
                    {scenario.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${DIFFICULTY_STYLES[scenario.difficulty]}`}
                  >
                    {scenario.difficulty}
                  </Badge>
                </div>
                <h3 className="font-tech font-bold text-foreground text-lg mb-2">
                  {scenario.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">
                  {scenario.situation}
                </p>
                <Button
                  variant="glow"
                  className="w-full font-tech tracking-wider"
                  onClick={() =>
                    navigate(`/deploy-team?scenario=${encodeURIComponent(scenario.id)}`)
                  }
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Launch Mission
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ClientBingoLingoBadge({ clientId }: { clientId: number }) {
  const { token } = useAuth();
  const { data } = useQuery<{ linked: boolean; bingolingoClients?: Array<{ id: number; name: string; slug: string }> }>({
    queryKey: ["bingolingo-link", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/integrations/piratemonster/bingolingo-link/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { linked: false };
      return res.json();
    },
    enabled: !!token,
    staleTime: 120000,
  });

  if (!data?.linked) return null;

  const blClient = data.bingolingoClients?.[0];

  return (
    <a
      href={blClient ? `/bingolingo/clients/${blClient.id}` : "#"}
      target="_blank"
      rel="noopener noreferrer"
      title={blClient ? `BingoLingo: ${blClient.name}` : "BingoLingo linked"}
    >
      <Badge variant="outline" className="text-[10px] text-gold border-gold/30 bg-gold/5 gap-1 cursor-pointer hover:bg-gold/10">
        <FileText className="w-2.5 h-2.5" />
        BingoLingo
      </Badge>
    </a>
  );
}
