import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Bot,
  Zap,
  FileText,
  CheckCircle,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface PackSummary {
  id: string;
  name: string;
  industry: string;
  icon: string;
  color: string;
  tagline: string;
  description: string;
  highlights: string[];
  botCount: number;
  scenarioCount: number;
  pipelineCount: number;
  kbDocCount: number;
  installed: boolean;
}

export default function PacksLibrary() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [installingPackId, setInstallingPackId] = useState<string | null>(null);

  const { data: packs = [], isLoading } = useQuery<PackSummary[]>({
    queryKey: ["packs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/packs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load packs");
      return res.json();
    },
  });

  const installMutation = useMutation({
    mutationFn: async (packId: string) => {
      setInstallingPackId(packId);
      const res = await fetch(`${API_BASE}/packs/${packId}/install`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to install pack");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Pack Installed",
        description: `${data.packName} has been installed with ${data.created.pipelines} pipeline(s), ${data.created.kbDocuments} KB document(s), and ${data.created.botOverlays} bot overlay(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["packs"] });
      setInstallingPackId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Installation Failed",
        description: error.message,
        variant: "destructive",
      });
      setInstallingPackId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Industry Starter Packs
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Pre-configured AI teams, missions, and pipelines tailored to your
            industry. Go from sign-up to actionable AI output in under 10
            minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packs.map((pack) => (
            <Card
              key={pack.id}
              className="group relative overflow-hidden hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/30"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: pack.color }}
              />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{pack.icon}</span>
                    <div>
                      <CardTitle className="text-lg">{pack.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {pack.tagline}
                      </CardDescription>
                    </div>
                  </div>
                  {pack.installed && (
                    <Badge
                      variant="default"
                      className="bg-green-600 hover:bg-green-700 text-xs"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Installed
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {pack.description}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {pack.botCount} Bot{pack.botCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {pack.scenarioCount} Mission
                      {pack.scenarioCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {pack.pipelineCount} Pipeline
                      {pack.pipelineCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {pack.kbDocCount} KB Doc
                      {pack.kbDocCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/packs/${pack.id}`)}
                  >
                    Preview
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  {user && !pack.installed && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => installMutation.mutate(pack.id)}
                      disabled={installingPackId === pack.id}
                    >
                      {installingPackId === pack.id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Package className="w-4 h-4 mr-1" />
                      )}
                      Install
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
