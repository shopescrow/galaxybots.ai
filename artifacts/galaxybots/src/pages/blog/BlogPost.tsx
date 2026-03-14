import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Calendar, Clock, ArrowLeft, Tag, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl sm:text-4xl font-display font-bold mt-10 mb-6 text-foreground">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-2xl font-display font-bold mt-8 mb-4 text-foreground">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-xl font-display font-semibold mt-6 mb-3 text-foreground">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="list-none space-y-2 my-4">
          {items.map((item, j) => {
            const parts = item.split("**");
            return (
              <li key={j} className="flex items-start gap-2 text-foreground/80">
                <span className="text-primary mt-1">•</span>
                <span>{parts.map((p, k) => k % 2 === 1 ? <strong key={k} className="text-foreground font-semibold">{p}</strong> : p)}</span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    } else if (line.startsWith("[") && line.includes("](")) {
      const match = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        elements.push(
          <div key={i} className="my-6">
            <Link href={match[2]}>
              <Button variant="glow" size="sm">{match[1].replace(" →", "")}</Button>
            </Link>
          </div>
        );
      }
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-4" />);
    } else {
      const parts = line.split("**");
      elements.push(
        <p key={i} className="text-foreground/80 leading-relaxed text-lg">
          {parts.map((p, k) => k % 2 === 1 ? <strong key={k} className="text-foreground font-semibold">{p}</strong> : p)}
        </p>
      );
    }
    i++;
  }
  return elements;
}

export default function BlogPostPage() {
  const prefersReducedMotion = useReducedMotion();
  const { slug } = useParams();

  const { data: post, isLoading, isError } = useQuery<BlogPost>({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/blog/${slug}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground font-tech">
          Loading briefing...
        </div>
      </AppLayout>
    );
  }

  if (isError || !post) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center space-y-4">
          <p className="text-muted-foreground font-tech">Briefing not found.</p>
          <Link href="/blog">
            <Button variant="outline">Back to Journal</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16">
        
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* Back */}
          <Link href="/blog">
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-tech mb-8 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Journal
            </button>
          </Link>

          {/* Category */}
          <div className={`inline-flex items-center gap-1.5 text-xs font-tech px-3 py-1 rounded-full border mb-6 ${CATEGORY_COLORS[post.category] || "text-foreground border-border"}`}>
            <Tag className="w-3 h-3" />
            {post.category}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight mb-6">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground font-tech mb-8 pb-8 border-b border-border/40">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {readingTime(post.content)} min read
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              {post.author}
            </span>
          </div>

          {/* Excerpt */}
          <p className="text-xl text-muted-foreground leading-relaxed mb-10 italic border-l-2 border-primary/40 pl-4">
            {post.excerpt}
          </p>

          {/* Content */}
          <div className="prose-like">
            {renderMarkdown(post.content)}
          </div>

          {/* Footer */}
          <div className="mt-16 pt-8 border-t border-border/40 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <Link href="/blog">
              <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-tech transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back to Journal
              </button>
            </Link>
            <Link href="/hire">
              <Button variant="glow" size="sm">Deploy Your AI Board →</Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
