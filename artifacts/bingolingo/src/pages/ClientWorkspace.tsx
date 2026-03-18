import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Send, Archive, Eye, Trash2, PenLine, ExternalLink, Key, Settings, Calendar, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

const typeLabels: Record<string, string> = {
  blog: "Blog Post",
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  email: "Email",
  press_release: "Press Release",
  case_study: "Case Study",
};

export default function ClientWorkspace() {
  const [, params] = useRoute("/clients/:id");
  const clientId = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("all");

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.getClient(clientId),
    enabled: !!clientId,
  });

  const { data: content = [] } = useQuery({
    queryKey: ["content", clientId],
    queryFn: () => api.getContent({ clientId }),
    enabled: !!clientId,
  });

  const { data: keys = [] } = useQuery({
    queryKey: ["api-keys", clientId],
    queryFn: () => api.getClientApiKeys(clientId),
    enabled: !!clientId,
  });

  const [publishUrlDialogId, setPublishUrlDialogId] = useState<number | null>(null);
  const [publishUrl, setPublishUrl] = useState("");

  const publishMutation = useMutation({
    mutationFn: ({ id, publishedUrl }: { id: number; publishedUrl?: string }) => api.publishContent(id, publishedUrl || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content", clientId] });
      setPublishUrlDialogId(null);
      setPublishUrl("");
      toast({ title: "Published" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.archiveContent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content", clientId] });
      toast({ title: "Archived" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteContent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content", clientId] });
      toast({ title: "Deleted" });
    },
  });

  const filteredContent = tab === "all" ? content : content.filter((c: any) => c.status === tab);

  const drafts = content.filter((c: any) => c.status === "draft").length;
  const published = content.filter((c: any) => c.status === "published").length;
  const totalViews = content.reduce((sum: number, c: any) => sum + (c.viewCount || 0), 0);

  if (!client) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/clients">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline">{client.industry}</Badge>
              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate max-w-[200px]">
                  {client.website} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 sm:ml-auto shrink-0">
          <Link href={`/clients/${clientId}/generate`}>
            <Button className="gap-2" size="sm">
              <PenLine className="h-4 w-4" /> Generate
            </Button>
          </Link>
          <Link href={`/clients/${clientId}/calendar`}>
            <Button variant="outline" className="gap-2" size="sm">
              <Calendar className="h-4 w-4" /> Calendar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Content</p>
            <p className="text-2xl font-bold">{content.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Drafts</p>
            <p className="text-2xl font-bold">{drafts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-2xl font-bold">{published}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Views</p>
            <p className="text-2xl font-bold">{totalViews}</p>
          </CardContent>
        </Card>
      </div>

      {keys.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Key className="h-4 w-4" /> API Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {keys.map((k: any) => (
                <div key={k.id} className="flex items-center justify-between text-sm px-3 py-2 rounded bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Badge variant={k.status === "active" ? "default" : "secondary"} className={k.status === "active" ? "bg-green-600" : ""}>
                      {k.status}
                    </Badge>
                    <span className="text-muted-foreground">{k.label || `Key #${k.id}`}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({content.length})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({drafts})</TabsTrigger>
          <TabsTrigger value="published">Published ({published})</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {filteredContent.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No content in this category.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredContent.map((item: any) => (
                <Card key={item.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate mb-1">{item.title}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{typeLabels[item.type] || item.type}</Badge>
                          <Badge variant={item.status === "published" ? "default" : item.status === "draft" ? "secondary" : "outline"}>
                            {item.status}
                          </Badge>
                          {item.tone && <span className="text-xs text-muted-foreground">{item.tone}</span>}
                          {item.viewCount > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Eye className="h-3 w-3" /> {item.viewCount}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                          {item.status === "published" && <AeoImpactBadge contentId={item.id} />}
                        </div>
                        {item.publishedUrl && (
                          <div className="mt-1">
                            <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate max-w-full">
                              <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{item.publishedUrl}</span>
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.status === "draft" && (
                          publishUrlDialogId === item.id ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Input
                                placeholder="Published URL (optional)"
                                value={publishUrl}
                                onChange={(e) => setPublishUrl(e.target.value)}
                                className="text-xs h-8 w-full sm:w-40"
                              />
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => publishMutation.mutate({ id: item.id, publishedUrl: publishUrl })}
                                disabled={publishMutation.isPending}
                              >
                                {publishMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setPublishUrlDialogId(null); setPublishUrl(""); }}>
                                <Minus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setPublishUrlDialogId(item.id)}>
                              <Send className="h-3 w-3 mr-1" /> Publish
                            </Button>
                          )
                        )}
                        {item.status === "published" && (
                          <Button variant="outline" size="sm" onClick={() => archiveMutation.mutate(item.id)} disabled={archiveMutation.isPending}>
                            <Archive className="h-3 w-3 mr-1" /> Archive
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AeoImpactData {
  delta: number | null;
  baselineScore: number | null;
  currentScore: number | null;
  status: string;
}

function AeoImpactBadge({ contentId }: { contentId: number }) {
  const { data, isLoading } = useQuery<AeoImpactData>({
    queryKey: ["aeo-impact", contentId],
    queryFn: () => api.getContentAeoImpact(contentId),
    staleTime: 60000,
  });

  if (isLoading) return null;
  if (!data || data.status === "no_url") return null;
  if (data.status === "awaiting_scan" || data.delta === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        AEO: Scanning...
      </Badge>
    );
  }

  const delta = data.delta;
  if (delta > 0) {
    return (
      <Badge className="text-xs bg-emerald-600 text-white gap-1">
        <TrendingUp className="h-3 w-3" /> +{delta} AEO
      </Badge>
    );
  } else if (delta < 0) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <TrendingDown className="h-3 w-3" /> {delta} AEO
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
      <Minus className="h-3 w-3" /> 0 AEO
    </Badge>
  );
}
