import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Sparkles, ArrowRight } from "lucide-react";

export function BingoLingoPanel() {
  const BINGOLINGO_API = `${import.meta.env.BASE_URL}../api/bingolingo`.replace(/\/\//g, "/");

  const { data: stats, isLoading, error: statsError } = useQuery<{
    clients: number;
    totalContent: number;
    published: number;
    drafts: number;
    totalViews: number;
  }>({
    queryKey: ["bingolingo-stats"],
    queryFn: async () => {
      const res = await fetch(`${BINGOLINGO_API}/dashboard-stats`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
      return res.json();
    },
    refetchInterval: 30000,
    retry: false,
  });

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Sparkles className="h-6 w-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">BingoLingo.ai</CardTitle>
            <Badge variant="default" className="gap-1 bg-green-600">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          </div>
          <CardDescription className="mt-1">
            AI-powered content intelligence platform — generate blog posts, social media content, email newsletters, case studies, and more.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : statsError ? (
          <p className="text-xs text-destructive py-2">{statsError.message}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.clients ?? 0}</div>
              <div className="text-xs text-muted-foreground">Clients</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.totalContent ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Content</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.published ?? 0}</div>
              <div className="text-xs text-muted-foreground">Published</div>
            </div>
            <div className="rounded-lg border bg-background p-3 text-center">
              <div className="text-lg font-bold">{stats?.totalViews ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total Views</div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            First-party integration — no API key needed. Same authenticated session as GalaxyBots.
          </p>
          <a href="/bingolingo/">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
              <ArrowRight className="w-3.5 h-3.5" />
              Open BingoLingo
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
