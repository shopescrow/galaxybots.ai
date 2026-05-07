import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, FileText, Eye, Send, PenLine, Plus, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: api.getDashboardStats,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: api.getClients,
  });

  const statCards = [
    { label: "Clients", value: stats?.clients ?? 0, icon: Users, color: "text-blue-500" },
    { label: "Total Content", value: stats?.totalContent ?? 0, icon: FileText, color: "text-purple-500" },
    { label: "Published", value: stats?.published ?? 0, icon: Send, color: "text-green-500" },
    { label: "Total Views", value: stats?.totalViews ?? 0, icon: Eye, color: "text-amber-500" },
  ];

  const typeLabels: Record<string, string> = {
    blog: "Blog Post",
    linkedin: "LinkedIn",
    twitter: "Twitter/X",
    email: "Email",
    press_release: "Press Release",
    case_study: "Case Study",
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">BingoLingo.ai</h1>
          <p className="text-muted-foreground mt-1">Content Intelligence Platform</p>
        </div>
        <Link href="/clients/new">
          <Button className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Client
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Clients</CardTitle>
            <Link href="/clients">
              <Button variant="ghost" size="sm" className="gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No clients yet. Add your first client to get started.</p>
            ) : (
              <div className="space-y-3">
                {clients.slice(0, 5).map((client: any) => (
                  <Link key={client.id} href={`/clients/${client.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.industry}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{client.contentCount} posts</Badge>
                        {client.lastPublishedAt && (
                          <span className="text-xs text-muted-foreground">
                            Last: {new Date(client.lastPublishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Content</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats?.recentContent?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No content yet. Generate your first piece of content.</p>
            ) : (
              <div className="space-y-3">
                {stats.recentContent.map((content: any) => (
                  <div key={content.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{content.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{typeLabels[content.type] || content.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(content.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Badge variant={content.status === "published" ? "default" : content.status === "draft" ? "secondary" : "outline"}>
                      {content.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
