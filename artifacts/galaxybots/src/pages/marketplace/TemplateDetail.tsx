import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Zap,
  GitBranch,
  ArrowLeft,
  Download,
  Star,
  ShieldCheck,
  Loader2,
  CheckCircle,
  Rocket,
  User,
  Calendar,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface TemplateDetail {
  id: number;
  type: string;
  title: string;
  description: string;
  category: string;
  industryTags: string[];
  visibility: string;
  sourceData: Record<string, unknown>;
  authorName: string;
  installCount: number;
  featured: boolean;
  verified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  alreadyInstalled: boolean;
}

const TYPE_ICONS: Record<string, typeof Bot> = {
  bot: Bot,
  scenario: Zap,
  pipeline: GitBranch,
};

const TYPE_LABELS: Record<string, string> = {
  bot: "Bot Template",
  scenario: "Scenario Template",
  pipeline: "Pipeline Template",
};

const TYPE_COLORS: Record<string, string> = {
  bot: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  scenario: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  pipeline: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function TemplateDetailPage() {
  const params = useParams<{ templateId: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deploying, setDeploying] = useState(false);

  const templateId = params.templateId;

  const { data: template, isLoading, error } = useQuery<TemplateDetail>({
    queryKey: ["marketplace", templateId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/marketplace/${templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Template not found");
      return res.json();
    },
    enabled: !!templateId,
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      setDeploying(true);
      const res = await fetch(`${API_BASE}/marketplace/${templateId}/deploy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Deployment failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Deployed Successfully",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["marketplace", templateId] });
      setDeploying(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Deployment Failed",
        description: error.message,
        variant: "destructive",
      });
      setDeploying(false);
    },
  });

  const handleDeploy = () => {
    if (!user) {
      navigate("/login");
      return;
    }
    deployMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Template not found</p>
        <Button variant="outline" onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Marketplace
        </Button>
      </div>
    );
  }

  const TypeIcon = TYPE_ICONS[template.type] || Bot;
  const typeColor = TYPE_COLORS[template.type] || TYPE_COLORS.bot;
  const sourceData = template.sourceData || {};

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/marketplace")}
          className="mb-6 gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className={cn("p-3 rounded-xl border", typeColor)}>
                    <TypeIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-2xl font-display font-bold text-foreground">
                        {template.title}
                      </h1>
                      {template.featured && (
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                      )}
                      {template.verified && (
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-tech">
                      {TYPE_LABELS[template.type] || "Template"}
                    </p>
                  </div>
                </div>

                <p className="text-foreground/80 leading-relaxed mb-6">
                  {template.description}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-tech capitalize">
                    {template.type}
                  </Badge>
                  <Badge variant="outline" className="font-tech">
                    {template.category}
                  </Badge>
                  {(template.industryTags || []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-tech text-xs">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-display">What's Included</CardTitle>
              </CardHeader>
              <CardContent>
                {template.type === "bot" && (
                  <div className="space-y-3">
                    <DetailRow label="Name" value={(sourceData as Record<string, string>).name} />
                    <DetailRow label="Title" value={(sourceData as Record<string, string>).title} />
                    <DetailRow label="Department" value={(sourceData as Record<string, string>).department} />
                    <DetailRow label="Personality" value={(sourceData as Record<string, string>).personality} />
                    {(sourceData as Record<string, string[]>).responsibilities?.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground font-tech">Responsibilities</span>
                        <ul className="mt-1 space-y-1">
                          {((sourceData as Record<string, string[]>).responsibilities || []).map((r, i) => (
                            <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                              <CheckCircle className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {template.type === "scenario" && (
                  <div className="space-y-3">
                    <DetailRow label="Objective" value={(sourceData as Record<string, string>).objective} />
                    {(sourceData as Record<string, string[]>).recommendedBotTitles?.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground font-tech">Recommended Bots</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {((sourceData as Record<string, string[]>).recommendedBotTitles || []).map((t, i) => (
                            <Badge key={i} variant="secondary" className="text-xs font-tech">
                              <Bot className="w-3 h-3 mr-1" />
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {template.type === "pipeline" && (
                  <div className="space-y-3">
                    <DetailRow label="Pipeline Name" value={(sourceData as Record<string, string>).name} />
                    <DetailRow label="Trigger" value={(sourceData as Record<string, string>).triggerType} />
                    {(sourceData as Record<string, { botTitle: string; instruction: string }[]>).steps?.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground font-tech">Pipeline Steps</span>
                        <div className="mt-2 space-y-2">
                          {((sourceData as Record<string, { botTitle: string; instruction: string }[]>).steps || []).map((step, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg bg-secondary/30 border border-border/50"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-tech text-primary">Step {i + 1}</span>
                                <Badge variant="outline" className="text-xs font-tech">
                                  {step.botTitle}
                                </Badge>
                              </div>
                              <p className="text-sm text-foreground/80">{step.instruction}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="bg-card/50 backdrop-blur-sm sticky top-8">
              <CardContent className="p-6 space-y-4">
                <Button
                  onClick={handleDeploy}
                  disabled={deploying}
                  className="w-full gap-2"
                  variant={template.alreadyInstalled ? "outline" : "default"}
                  size="lg"
                >
                  {deploying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {template.alreadyInstalled ? "Updating…" : "Deploying…"}
                    </>
                  ) : template.alreadyInstalled ? (
                    <>
                      <Download className="w-4 h-4" />
                      Re-deploy / Update
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      Deploy to My Account
                    </>
                  )}
                </Button>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground font-tech">
                      {template.authorName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Download className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground font-tech">
                      {template.installCount} deployment{template.installCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground font-tech">
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {template.verified && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-tech">
                      Verified by GalaxyBots
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-muted-foreground font-tech">{label}</span>
      <p className="text-sm text-foreground/80 mt-0.5">{value}</p>
    </div>
  );
}
