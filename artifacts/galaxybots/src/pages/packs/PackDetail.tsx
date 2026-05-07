import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Bot,
  Zap,
  Package,
  FileText,
  CheckCircle,
  Loader2,
  Target,
  GitBranch,
  Star,
  Shield,
} from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface BotOverlayPreview {
  botTitle: string;
  description: string;
}

interface ScenarioPreview {
  title: string;
  category: string;
  difficulty: string;
  situation: string;
  actions: string[];
  recommendedBots: string[];
}

interface PipelinePreview {
  name: string;
  triggerType: string;
  stepCount: number;
  steps: { botTitle: string; instruction: string }[];
}

interface KBDocPreview {
  title: string;
  filename: string;
}

interface PackDetail {
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
  botOverlays: BotOverlayPreview[];
  scenarios: ScenarioPreview[];
  pipelines: PipelinePreview[];
  kbDocuments: KBDocPreview[];
}

const difficultyColors: Record<string, string> = {
  Tactical: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Strategic:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function PackDetailPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/packs/:packId");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [installing, setInstalling] = useState(false);
  const packId = params?.packId;

  const { data: pack, isLoading } = useQuery<PackDetail>({
    queryKey: ["packs", packId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/packs/${packId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load pack");
      return res.json();
    },
    enabled: !!packId,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      setInstalling(true);
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
        description: `${data.packName} is now active.`,
      });
      queryClient.invalidateQueries({ queryKey: ["packs"] });
      setInstalling(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Installation Failed",
        description: error.message,
        variant: "destructive",
      });
      setInstalling(false);
    },
  });

  if (isLoading || !pack) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/packs")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Packs
        </Button>

        <div
          className="rounded-xl p-6 mb-8 text-white relative overflow-hidden"
          style={{ backgroundColor: pack.color }}
        >
          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <span className="text-5xl">{pack.icon}</span>
                <div>
                  <h1 className="text-3xl font-bold">{pack.name}</h1>
                  <p className="text-white/80 text-lg mt-1">{pack.tagline}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {pack.installed ? (
                  <Badge className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Installed
                  </Badge>
                ) : user ? (
                  <Button
                    onClick={() => installMutation.mutate()}
                    disabled={installing}
                    className="bg-white text-gray-900 hover:bg-white/90"
                  >
                    {installing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Package className="w-4 h-4 mr-2" />
                    )}
                    Install to My Account
                  </Button>
                ) : (
                  <Button
                    onClick={() => navigate("/register")}
                    className="bg-white text-gray-900 hover:bg-white/90"
                  >
                    Sign Up to Install
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-6 mt-6">
              <div className="flex items-center gap-2 text-white/90">
                <Bot className="w-5 h-5" />
                <span>
                  {pack.botCount} Bot Overlay{pack.botCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <Target className="w-5 h-5" />
                <span>
                  {pack.scenarioCount} Mission
                  {pack.scenarioCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <GitBranch className="w-5 h-5" />
                <span>
                  {pack.pipelineCount} Pipeline
                  {pack.pipelineCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <FileText className="w-5 h-5" />
                <span>
                  {pack.kbDocCount} KB Doc{pack.kbDocCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <h2 className="text-xl font-semibold mb-2">About This Pack</h2>
              <p className="text-muted-foreground">{pack.description}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Included Missions
              </h2>
              <div className="space-y-4">
                {pack.scenarios.map((scenario, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">
                          {scenario.title}
                        </CardTitle>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">
                            {scenario.category}
                          </Badge>
                          <Badge
                            className={`text-xs ${difficultyColors[scenario.difficulty] || ""}`}
                          >
                            {scenario.difficulty}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {scenario.situation}
                      </p>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Actions:
                        </p>
                        <ul className="text-sm space-y-1">
                          {scenario.actions.map((action, j) => (
                            <li key={j} className="flex items-start gap-2">
                              <Zap className="w-3 h-3 mt-1.5 text-primary shrink-0" />
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {scenario.recommendedBots.map((bot, j) => (
                          <Badge
                            key={j}
                            variant="secondary"
                            className="text-xs"
                          >
                            <Bot className="w-3 h-3 mr-1" />
                            {bot}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Included Pipelines
              </h2>
              <div className="space-y-4">
                {pack.pipelines.map((pipeline, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {pipeline.name}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs capitalize">
                          {pipeline.triggerType}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {pipeline.steps.map((step, j) => (
                          <div
                            key={j}
                            className="flex items-start gap-3 relative"
                          >
                            <div className="flex flex-col items-center">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                style={{ backgroundColor: pack.color }}
                              >
                                {j + 1}
                              </div>
                              {j < pipeline.steps.length - 1 && (
                                <div className="w-0.5 h-6 bg-border mt-1" />
                              )}
                            </div>
                            <div className="pt-1">
                              <p className="text-sm font-medium">
                                {step.botTitle}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {step.instruction}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Highlights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {pack.highlights.map((highlight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Enhanced Bots
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pack.botOverlays.map((overlay, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Shield className="w-3 h-3 text-primary" />
                      {overlay.botTitle}
                    </p>
                    <p className="text-xs text-muted-foreground pl-5">
                      {overlay.description}
                    </p>
                    {i < pack.botOverlays.length - 1 && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Knowledge Base Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pack.kbDocuments.map((doc, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>{doc.title}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {!pack.installed && user && (
              <Button
                className="w-full"
                size="lg"
                onClick={() => installMutation.mutate()}
                disabled={installing}
              >
                {installing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Package className="w-4 h-4 mr-2" />
                )}
                Install This Pack
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
