import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRoute, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Eye } from "lucide-react";
import { useMemo } from "react";

function sanitizeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface MarkdownNode {
  type: "heading" | "paragraph" | "list-item" | "text";
  level?: number;
  content: string;
}

function parseMarkdown(text: string): MarkdownNode[] {
  const lines = text.split("\n");
  const nodes: MarkdownNode[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const h3Match = trimmed.match(/^### (.+)$/);
    if (h3Match) {
      nodes.push({ type: "heading", level: 3, content: h3Match[1] });
      continue;
    }

    const h2Match = trimmed.match(/^## (.+)$/);
    if (h2Match) {
      nodes.push({ type: "heading", level: 2, content: h2Match[1] });
      continue;
    }

    const h1Match = trimmed.match(/^# (.+)$/);
    if (h1Match) {
      nodes.push({ type: "heading", level: 1, content: h1Match[1] });
      continue;
    }

    const listMatch = trimmed.match(/^[-*] (.+)$/);
    if (listMatch) {
      nodes.push({ type: "list-item", content: listMatch[1] });
      continue;
    }

    const numListMatch = trimmed.match(/^\d+\. (.+)$/);
    if (numListMatch) {
      nodes.push({ type: "list-item", content: numListMatch[1] });
      continue;
    }

    nodes.push({ type: "paragraph", content: trimmed });
  }

  return nodes;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const safe = sanitizeText(text);
  const parts: React.ReactNode[] = [];
  let remaining = safe;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(.+?)\*/);

    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
      }
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
    } else if (italicMatch && italicMatch.index !== undefined) {
      if (italicMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, italicMatch.index)}</span>);
      }
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
    } else {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
  }

  return parts;
}

function MarkdownRenderer({ text }: { text: string }) {
  const nodes = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className="space-y-4">
      {nodes.map((node, i) => {
        switch (node.type) {
          case "heading":
            if (node.level === 1) return <h1 key={i} className="text-2xl font-bold mt-8 mb-4">{renderInlineFormatting(node.content)}</h1>;
            if (node.level === 2) return <h2 key={i} className="text-xl font-bold mt-8 mb-3">{renderInlineFormatting(node.content)}</h2>;
            return <h3 key={i} className="text-lg font-semibold mt-6 mb-2">{renderInlineFormatting(node.content)}</h3>;
          case "list-item":
            return <li key={i} className="ml-4 list-disc">{renderInlineFormatting(node.content)}</li>;
          case "paragraph":
          default:
            return <p key={i} className="mb-4">{renderInlineFormatting(node.content)}</p>;
        }
      })}
    </div>
  );
}

export default function HubPost() {
  const [, params] = useRoute("/hub/:clientSlug/:contentSlug");
  const clientSlug = params?.clientSlug || "";
  const contentSlug = params?.contentSlug || "";

  const { data, isLoading } = useQuery({
    queryKey: ["hub-post", clientSlug, contentSlug],
    queryFn: () => api.getHubPost(clientSlug, contentSlug),
    enabled: !!clientSlug && !!contentSlug,
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (!data?.post) return <div className="text-center py-12 text-muted-foreground">Post not found.</div>;

  const { client, post } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/hub/${clientSlug}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to {client.name}
          </Button>
        </Link>
      </div>

      <article>
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-4">{post.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{client.name}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {post.viewCount} views
            </span>
          </div>
          {post.keywords && post.keywords.length > 0 && (
            <div className="flex gap-1 mt-3">
              {post.keywords.map((kw: string) => (
                <Badge key={kw} variant="secondary">{kw}</Badge>
              ))}
            </div>
          )}
        </header>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <MarkdownRenderer text={post.body} />
        </div>
      </article>
    </div>
  );
}
