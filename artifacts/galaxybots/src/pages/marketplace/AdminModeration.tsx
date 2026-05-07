import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Star,
  Loader2,
  Bot,
  Zap,
  GitBranch,
  Store,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface Template {
  id: number;
  type: string;
  title: string;
  description: string;
  category: string;
  industryTags: string[];
  authorName: string;
  installCount: number;
  featured: boolean;
  verified: boolean;
  status: string;
  createdAt: string;
}

const STATUS_TABS = ["pending", "approved", "rejected"];

const TYPE_ICONS: Record<string, typeof Bot> = {
  bot: Bot,
  scenario: Zap,
  pipeline: GitBranch,
};

export default function AdminModeration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState("pending");

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["admin-marketplace", activeStatus],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/marketplace?status=${activeStatus}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load templates");
      return res.json();
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: number;
      updates: Record<string, unknown>;
    }) => {
      const res = await fetch(`${API_BASE}/admin/marketplace/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace"] });
      toast({ title: "Template Updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold">
              Marketplace <span className="text-gradient">Moderation</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-tech text-sm">
            Review, approve, and manage community-submitted templates
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {STATUS_TABS.map((status) => (
            <Button
              key={status}
              variant={activeStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveStatus(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-tech">
              No {activeStatus} templates
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((t) => {
              const TypeIcon = TYPE_ICONS[t.type] || Bot;
              return (
                <Card key={t.id} className="bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 rounded-lg bg-secondary/50">
                          <TypeIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-display font-semibold truncate">
                              {t.title}
                            </h3>
                            <Badge variant="outline" className="text-xs capitalize shrink-0">
                              {t.type}
                            </Badge>
                            {t.featured && (
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                            )}
                            {t.verified && (
                              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {t.description}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                            <span>by {t.authorName}</span>
                            <span>{t.category}</span>
                            <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        {activeStatus === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                              onClick={() =>
                                moderateMutation.mutate({
                                  id: t.id,
                                  updates: { status: "approved" },
                                })
                              }
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                              onClick={() =>
                                moderateMutation.mutate({
                                  id: t.id,
                                  updates: { status: "rejected" },
                                })
                              }
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                        {activeStatus === "approved" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                "gap-1",
                                t.verified
                                  ? "text-emerald-400 border-emerald-500/30"
                                  : "text-muted-foreground",
                              )}
                              onClick={() =>
                                moderateMutation.mutate({
                                  id: t.id,
                                  updates: { verified: !t.verified },
                                })
                              }
                            >
                              <ShieldCheck
                                className={cn(
                                  "w-3.5 h-3.5",
                                  t.verified && "text-emerald-400",
                                )}
                              />
                              {t.verified ? "Unverify" : "Verify"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                "gap-1",
                                t.featured
                                  ? "text-amber-400 border-amber-500/30"
                                  : "text-muted-foreground",
                              )}
                              onClick={() =>
                                moderateMutation.mutate({
                                  id: t.id,
                                  updates: { featured: !t.featured },
                                })
                              }
                            >
                              <Star
                                className={cn(
                                  "w-3.5 h-3.5",
                                  t.featured && "fill-amber-400",
                                )}
                              />
                              {t.featured ? "Unfeature" : "Feature"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                              onClick={() =>
                                moderateMutation.mutate({
                                  id: t.id,
                                  updates: { status: "rejected" },
                                })
                              }
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Remove
                            </Button>
                          </>
                        )}
                        {activeStatus === "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() =>
                              moderateMutation.mutate({
                                id: t.id,
                                updates: { status: "approved" },
                              })
                            }
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Re-approve
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
