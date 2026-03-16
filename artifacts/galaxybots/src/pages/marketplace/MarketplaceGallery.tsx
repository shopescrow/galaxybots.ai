import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Bot,
  Zap,
  GitBranch,
  Star,
  Download,
  ShieldCheck,
  Loader2,
  Store,
  ArrowRight,
  Sparkles,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface MarketplaceTemplate {
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
  createdAt: string;
}

const TYPE_FILTERS = [
  { key: "all", label: "All", icon: Store },
  { key: "bot", label: "Bots", icon: Bot },
  { key: "scenario", label: "Scenarios", icon: Zap },
  { key: "pipeline", label: "Pipelines", icon: GitBranch },
];

const CATEGORY_FILTERS = [
  "All",
  "Strategy",
  "Finance",
  "Marketing",
  "Sales",
  "Operations",
  "Technology",
  "HR",
  "Legal",
  "Customer Success",
];

const TYPE_ICONS: Record<string, typeof Bot> = {
  bot: Bot,
  scenario: Zap,
  pipeline: GitBranch,
};

const TYPE_COLORS: Record<string, string> = {
  bot: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  scenario: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  pipeline: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function MarketplaceGallery() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("recent");
  const [industryFilter, setIndustryFilter] = useState("");

  const { data: templates = [], isLoading } = useQuery<MarketplaceTemplate[]>({
    queryKey: ["marketplace", typeFilter, categoryFilter, search, sortBy, industryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (categoryFilter !== "All") params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());
      if (sortBy === "popular") params.set("sort", "popular");
      if (industryFilter) params.set("industry", industryFilter);
      const res = await fetch(`${API_BASE}/marketplace?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load marketplace");
      return res.json();
    },
  });

  const allIndustryTags = Array.from(
    new Set(templates.flatMap((t) => t.industryTags || [])),
  ).sort();

  const featuredTemplates = templates.filter((t) => t.featured);
  const regularTemplates = templates.filter((t) => !t.featured);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Store className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Bot & Scenario <span className="text-gradient">Marketplace</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-tech text-sm">
            Browse and deploy pre-built bots, scenarios, and pipelines from the community
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary/30 border-border/50"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={sortBy === "recent" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("recent")}
            >
              Recent
            </Button>
            <Button
              variant={sortBy === "popular" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("popular")}
            >
              Popular
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {TYPE_FILTERS.map((f) => {
            const Icon = f.icon;
            return (
              <Button
                key={f.key}
                variant={typeFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setTypeFilter(f.key)}
                className="gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                {f.label}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-8">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-tech transition-all",
                categoryFilter === cat
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary/30 text-muted-foreground border border-border/50 hover:bg-secondary/50",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {allIndustryTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-8">
            <Tag className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            <button
              onClick={() => setIndustryFilter("")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-tech transition-all",
                !industryFilter
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary/30 text-muted-foreground border border-border/50 hover:bg-secondary/50",
              )}
            >
              All Industries
            </button>
            {allIndustryTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setIndustryFilter(tag)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-tech transition-all",
                  industryFilter === tag
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary/30 text-muted-foreground border border-border/50 hover:bg-secondary/50",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-24">
            <Store className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-tech">No templates found</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <>
            {featuredTemplates.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h2 className="text-lg font-display font-semibold">Featured</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featuredTemplates.map((t) => (
                    <TemplateCard key={t.id} template={t} onClick={() => navigate(`/marketplace/${t.id}`)} />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {regularTemplates.map((t) => (
                <TemplateCard key={t.id} template={t} onClick={() => navigate(`/marketplace/${t.id}`)} />
              ))}
            </div>
          </>
        )}

        {user && (
          <div className="mt-12 text-center">
            <Button variant="outline" onClick={() => navigate("/settings")}>
              View My Published Templates
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onClick,
}: {
  template: MarketplaceTemplate;
  onClick: () => void;
}) {
  const TypeIcon = TYPE_ICONS[template.type] || Bot;
  const typeColor = TYPE_COLORS[template.type] || TYPE_COLORS.bot;

  return (
    <Card
      className="group cursor-pointer hover:border-primary/30 transition-all bg-card/50 backdrop-blur-sm"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("p-2 rounded-lg border", typeColor)}>
            <TypeIcon className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            {template.featured && (
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            )}
            {template.verified && (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            )}
          </div>
        </div>

        <h3 className="font-display font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors line-clamp-1">
          {template.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3 font-tech">
          {template.description}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="outline" className="text-xs font-tech capitalize">
            {template.type}
          </Badge>
          <Badge variant="outline" className="text-xs font-tech">
            {template.category}
          </Badge>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground font-tech">
            by {template.authorName}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="w-3 h-3" />
            {template.installCount}
          </div>
        </div>

        <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-primary flex items-center gap-1 font-tech">
            View Details <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
