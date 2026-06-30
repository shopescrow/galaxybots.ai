import { AppLayout } from "@/components/layout/AppLayout";
import { useBots } from "@/hooks/use-bots";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Search, BotIcon, Mic } from "lucide-react";
import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BotRosterSkeleton } from "@/components/skeletons/PageSkeletons";

export default function BotRoster() {
  const { data: bots, isLoading } = useBots();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const categories = useMemo(() => {
    if (!bots?.data) return [];
    const cats = new Set(bots.data.map(b => b.category));
    return Array.from(cats).sort();
  }, [bots]);

  const filteredBots = useMemo(() => {
    if (!bots?.data) return [];
    return bots.data.filter(bot => {
      const matchesSearch = bot.name.toLowerCase().includes(search.toLowerCase()) || 
                            bot.title.toLowerCase().includes(search.toLowerCase());
      const matchesCat = categoryFilter ? bot.category === categoryFilter : true;
      return matchesSearch && matchesCat;
    });
  }, [bots, search, categoryFilter]);

  if (isLoading) {
    return (
      <AppLayout>
        <BotRosterSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold mb-2">Corporate Roster</h1>
            <p className="text-muted-foreground text-base sm:text-lg">Your elite team of AI directors and specialists.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-3.5 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder="Search directors..." 
              className="pl-10 min-h-[44px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 mb-10">
          <div className="flex gap-2 w-max">
            <Badge 
              variant={categoryFilter === null ? "glow" : "secondary"}
              className="cursor-pointer px-4 py-1.5 text-sm min-h-[44px] flex items-center whitespace-nowrap"
              onClick={() => setCategoryFilter(null)}
            >
              All Departments
            </Badge>
            {categories.map(cat => (
              <Badge 
                key={cat}
                variant={categoryFilter === cat ? "glow" : "outline"}
                className="cursor-pointer px-4 py-1.5 text-sm min-h-[44px] flex items-center whitespace-nowrap"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBots.map((bot, i) => (
              <motion.div
                key={bot.id}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: prefersReducedMotion ? 0 : i * 0.05 }}
              >
                <Link href={bot.addonType === "receptionist" ? "/bots/ai-receptionist" : `/bots/${bot.id}`}>
                  <Card className="h-full cursor-pointer group hover:border-primary/50 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/20 transition-all" />
                    <CardHeader className="pb-4 relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center border border-border/50 group-hover:border-primary/50">
                          {bot.avatar ? (
                            <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover rounded-xl" />
                          ) : (
                            <BotIcon className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {bot.addonType === "receptionist" && (
                            <Badge variant="glow" className="gap-1">
                              <Mic className="w-3 h-3" /> Voice
                            </Badge>
                          )}
                          <Badge variant={bot.isAvailable ? "cyan" : "secondary"}>
                            {bot.isAvailable ? "Available" : "Assigned"}
                          </Badge>
                        </div>
                      </div>
                      <CardTitle className="mb-1 group-hover:text-primary transition-colors">{bot.name}</CardTitle>
                      <CardDescription className="text-cyan">{bot.title}</CardDescription>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                        {bot.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {bot.department}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
      </div>
    </AppLayout>
  );
}
