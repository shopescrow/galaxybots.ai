import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Calendar, Clock, ArrowRight, BookOpen, Tag } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  category: string;
  coverImage: string | null;
  publishedAt: string;
  createdAt: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  EdTech: "text-cyan border-cyan/30 bg-cyan/10",
  Strategy: "text-primary border-primary/30 bg-primary/10",
  Technology: "text-purple border-purple/30 bg-purple/10",
  Partnership: "text-gold border-gold/30 bg-gold/10",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function readingTime(content: string) {
  const words = content.split(/\s+/).length;
  return Math.ceil(words / 200);
}

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["blog-posts", activeCategory],
    queryFn: async () => {
      const params = activeCategory !== "All" ? `?category=${encodeURIComponent(activeCategory)}` : "";
      const res = await fetch(`${BASE}/api/blog${params}`);
      if (!res.ok) throw new Error("Failed to fetch blog posts");
      return res.json();
    },
  });

  const categories = ["All", "Strategy", "Technology", "EdTech", "Partnership"];

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 text-xs font-tech text-primary uppercase tracking-widest mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            Intelligence Briefings
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-bold mb-6">
            The GalaxyBots <span className="text-gradient">Journal</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Strategic intelligence, industry analysis, and deployment guides from the GalaxyBots.ai executive team.
          </p>
        </motion.div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-12">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-tech border transition-all duration-200 ${
                activeCategory === cat
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "text-muted-foreground border-border/50 hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-24 text-muted-foreground font-tech">Loading intelligence briefings...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground font-tech">No posts found in this category.</div>
        ) : (
          <>
            {/* Featured Post */}
            {featured && activeCategory === "All" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-12"
              >
                <Link href={`/blog/${featured.slug}`}>
                  <div className="group relative overflow-hidden rounded-3xl border border-primary/20 bg-card hover:border-primary/40 transition-all duration-500 p-8 lg:p-12 cursor-pointer">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute top-6 left-6">
                      <span className="bg-primary/20 border border-primary/30 text-primary text-xs font-tech font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        Featured
                      </span>
                    </div>
                    <div className="relative z-10 pt-8 lg:pt-4 max-w-3xl">
                      <div className={`inline-flex items-center gap-1.5 text-xs font-tech px-3 py-1 rounded-full border mb-4 ${CATEGORY_COLORS[featured.category] || "text-foreground border-border"}`}>
                        <Tag className="w-3 h-3" />
                        {featured.category}
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-display font-bold mb-4 group-hover:text-primary transition-colors">
                        {featured.title}
                      </h2>
                      <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                        {featured.excerpt}
                      </p>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground font-tech">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {formatDate(featured.publishedAt)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {readingTime(featured.content)} min read
                        </span>
                        <span className="text-foreground/60">{featured.author}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-6 text-primary font-tech text-sm">
                        Read briefing <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )}

            {/* Post Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(activeCategory === "All" ? rest : posts).map((post, i) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <Link href={`/blog/${post.slug}`}>
                    <div className="group h-full rounded-2xl border border-border/50 bg-card hover:border-primary/30 transition-all duration-300 p-6 cursor-pointer flex flex-col">
                      <div className={`inline-flex items-center gap-1.5 text-xs font-tech px-2.5 py-1 rounded-full border mb-4 self-start ${CATEGORY_COLORS[post.category] || "text-foreground border-border"}`}>
                        <Tag className="w-3 h-3" />
                        {post.category}
                      </div>
                      <h3 className="text-lg font-display font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {post.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground font-tech mt-auto pt-4 border-t border-border/30">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(post.publishedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {readingTime(post.content)} min
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
