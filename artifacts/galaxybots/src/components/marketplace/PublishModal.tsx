import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Store,
  Loader2,
  X,
  Plus,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

const CATEGORIES = [
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

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "bot" | "scenario" | "pipeline";
  sourceData: Record<string, unknown>;
  defaultTitle?: string;
  defaultDescription?: string;
}

export function PublishModal({
  open,
  onOpenChange,
  type,
  sourceData,
  defaultTitle = "",
  defaultDescription = "",
}: PublishModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [tagInput, setTagInput] = useState("");
  const [industryTags, setIndustryTags] = useState<string[]>([]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/marketplace`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          description,
          category,
          industryTags,
          visibility,
          sourceData,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to publish");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Published to Marketplace",
        description: "Your template has been submitted for review.",
      });
      queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Publish Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !industryTags.includes(tag)) {
      setIndustryTags([...industryTags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setIndustryTags(industryTags.filter((t) => t !== tag));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative bg-card border border-border/50 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Store className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold">
                  Publish to Marketplace
                </h2>
                <p className="text-xs text-muted-foreground font-tech capitalize">
                  {type} template
                </p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-tech text-muted-foreground mb-1.5 block">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Growth Strategy Bot"
                className="bg-secondary/30"
              />
            </div>

            <div>
              <label className="text-sm font-tech text-muted-foreground mb-1.5 block">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this template does and who it's for..."
                rows={3}
                className="w-full px-3 py-2 rounded-md bg-secondary/30 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <div>
              <label className="text-sm font-tech text-muted-foreground mb-1.5 block">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-tech transition-all border",
                      category === cat
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/50",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-tech text-muted-foreground mb-1.5 block">
                Visibility
              </label>
              <div className="flex gap-2">
                {(["public", "unlisted"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-tech transition-all border flex-1",
                      visibility === v
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/50",
                    )}
                  >
                    {v === "public" ? "Public" : "Unlisted (link only)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-tech text-muted-foreground mb-1.5 block">
                Industry Tags
              </label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="e.g., Healthcare"
                  className="bg-secondary/30 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={addTag}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {industryTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {industryTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-xs font-tech gap-1 cursor-pointer"
                      onClick={() => removeTag(tag)}
                    >
                      {tag}
                      <X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => publishMutation.mutate()}
                disabled={!title.trim() || !description.trim() || publishMutation.isPending}
                className="flex-1 gap-2"
              >
                {publishMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing…
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Publish
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
