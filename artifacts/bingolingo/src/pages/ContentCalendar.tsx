import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lightbulb, Calendar, FileText } from "lucide-react";

const typeLabels: Record<string, string> = {
  blog: "Blog Post",
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  email: "Email",
  press_release: "Press Release",
  case_study: "Case Study",
};

const typeColors: Record<string, string> = {
  blog: "bg-blue-500",
  linkedin: "bg-sky-500",
  twitter: "bg-cyan-500",
  email: "bg-amber-500",
  press_release: "bg-purple-500",
  case_study: "bg-green-500",
};

export default function ContentCalendar() {
  const [, params] = useRoute("/clients/:id/calendar");
  const clientId = Number(params?.id);

  const { data } = useQuery({
    queryKey: ["calendar", clientId],
    queryFn: () => api.getCalendar(clientId),
    enabled: !!clientId,
  });

  const contentByMonth: Record<string, any[]> = {};
  if (data?.content) {
    for (const item of data.content) {
      const date = item.publishedAt || item.createdAt;
      const month = new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!contentByMonth[month]) contentByMonth[month] = [];
      contentByMonth[month].push(item);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Calendar</h1>
          <p className="text-muted-foreground text-sm">Publication timeline and topic suggestions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{data?.published ?? 0}</p>
                <p className="text-xs text-muted-foreground">Published</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{data?.drafts ?? 0}</p>
                <p className="text-xs text-muted-foreground">Drafts</p>
              </CardContent>
            </Card>
            {data?.typeBreakdown && Object.entries(data.typeBreakdown).slice(0, 2).map(([type, count]) => (
              <Card key={type}>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold">{count as number}</p>
                  <p className="text-xs text-muted-foreground">{typeLabels[type] || type}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {Object.keys(contentByMonth).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No content yet. Start generating content to build your timeline.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(contentByMonth).map(([month, items]) => (
              <div key={month}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> {month}
                </h3>
                <div className="space-y-2">
                  {items.map((item: any) => (
                    <Card key={item.id}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-1 h-8 rounded-full ${typeColors[item.type] || "bg-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-xs">{typeLabels[item.type] || item.type}</Badge>
                              <Badge variant={item.status === "published" ? "default" : "secondary"} className="text-xs">
                                {item.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.publishedAt || item.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" /> Suggested Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.suggestedTopics ? (
                <div className="space-y-3">
                  {data.suggestedTopics.map((topic: string, i: number) => (
                    <Link key={i} href={`/clients/${clientId}/generate`}>
                      <div className="p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                        <p className="text-sm">{topic}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading suggestions...</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
