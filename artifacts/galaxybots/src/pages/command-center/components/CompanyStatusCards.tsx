import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertTriangle, Building, ExternalLink, Heart } from "lucide-react";
import { formatTime, formatToolName, HEALTH_TAG_STYLES, HealthTrendIcon } from "./helpers";
import type { CompanyCard } from "./types";

export function CompanyStatusCards({ companies }: { companies: CompanyCard[] }) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Building className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No companies found.</p>
      </div>
    );
  }

  const sorted = [...companies].sort((a, b) => {
    const tagOrder: Record<string, number> = { critical: 0, at_risk: 1, healthy: 2 };
    const aOrder = a.healthTag ? (tagOrder[a.healthTag] ?? 3) : 3;
    const bOrder = b.healthTag ? (tagOrder[b.healthTag] ?? 3) : 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.healthScore ?? 100) - (b.healthScore ?? 100);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sorted.map((company) => {
        const tagStyle = company.healthTag ? HEALTH_TAG_STYLES[company.healthTag] : null;
        const isCritical = company.healthTag === "critical";

        return (
          <Card
            key={company.id}
            className={`hover:border-primary/40 transition-colors ${
              isCritical ? "border-red-500/40 ring-1 ring-red-500/20" : ""
            }`}
          >
            <CardHeader className="pb-3 border-b border-border/30">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 min-w-0">
                  {isCritical && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
                  <CardTitle className="text-base truncate">{company.companyName}</CardTitle>
                </div>
                <Badge
                  variant={
                    company.status === "active"
                      ? "cyan"
                      : company.status === "trial"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {company.status.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase text-gold border-gold/30 bg-gold/5"
                >
                  {company.plan} TIER
                </Badge>
                {tagStyle && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${tagStyle.text} ${tagStyle.border} ${tagStyle.bg}`}
                  >
                    <Heart className="w-3 h-3 mr-1" />
                    {company.healthScore !== null ? company.healthScore : "—"} {tagStyle.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-sm">
              {company.healthScore !== null && (
                <div className="flex justify-between text-muted-foreground items-center">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    Health
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          company.healthScore >= 70 ? "bg-green-500" :
                          company.healthScore >= 40 ? "bg-yellow-500" :
                          "bg-red-500"
                        }`}
                        style={{ width: `${company.healthScore}%` }}
                      />
                    </div>
                    <span className="text-foreground font-medium text-xs">{company.healthScore}</span>
                    <HealthTrendIcon trend={company.healthTrend} />
                  </div>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Active Sessions</span>
                <span className="text-foreground font-medium">{company.activeSessions}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Last Bot Action</span>
                <span className="text-foreground text-xs">
                  {company.lastBotAction
                    ? formatTime(company.lastBotAction)
                    : "None"}
                </span>
              </div>
              {company.lastToolName && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Last Tool</span>
                  <span className="text-foreground text-xs truncate ml-2">
                    {formatToolName(company.lastToolName)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Next Scheduled</span>
                <span className="text-foreground text-xs">
                  {company.nextScheduledRun
                    ? formatTime(company.nextScheduledRun)
                    : "None"}
                </span>
              </div>
              <div className="pt-3 border-t border-border/30">
                <Link href={`/clients/${company.id}`}>
                  <Button variant="outline" size="sm" className="w-full font-tech text-xs gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
