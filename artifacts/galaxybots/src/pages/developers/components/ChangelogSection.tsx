import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import type { ChangelogEntry } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ChangelogSection() {
  const { data: entries, isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["developer", "changelog"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/developer/changelog`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">API Changelog</h2>
      <p className="text-sm text-muted-foreground">
        Track API changes, new features, and breaking changes across versions.
      </p>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border/50" />
        <div className="space-y-6">
          {entries?.map((entry) => (
            <div key={entry.id} className="relative pl-10">
              <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-primary bg-background" />
              <Card className="border-border/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{entry.version}</Badge>
                    {entry.breaking && (
                      <Badge variant="destructive" className="text-[10px]">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Breaking
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(entry.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-sm">{entry.title}</h3>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                  {entry.changes && entry.changes.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {entry.changes.map((change, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {(!entries || entries.length === 0) && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No changelog entries yet.
        </div>
      )}
    </div>
  );
}
