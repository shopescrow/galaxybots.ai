import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Eye } from "lucide-react";

export default function ContentHub() {
  const [, params] = useRoute("/hub/:clientSlug");
  const clientSlug = params?.clientSlug || "";

  const { data, isLoading } = useQuery({
    queryKey: ["hub", clientSlug],
    queryFn: () => api.getHub(clientSlug),
    enabled: !!clientSlug,
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (!data?.client) return <div className="text-center py-12 text-muted-foreground">Client not found.</div>;

  const { client, posts } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center py-12 border-b">
        <h1 className="text-4xl font-bold tracking-tight">{client.name}</h1>
        {client.tagline && <p className="text-lg text-muted-foreground mt-2">{client.tagline}</p>}
        <Badge variant="outline" className="mt-3">{client.industry}</Badge>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No published content yet.</p>
          <p className="text-sm mt-1">Check back soon for new articles and insights.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post: any) => (
            <Link key={post.id} href={`/hub/${clientSlug}/${post.slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
                  {post.metaDescription && (
                    <p className="text-muted-foreground text-sm mb-3">{post.metaDescription}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {post.viewCount} views
                    </span>
                    {post.keywords && post.keywords.length > 0 && (
                      <div className="flex gap-1">
                        {post.keywords.slice(0, 3).map((kw: string) => (
                          <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
