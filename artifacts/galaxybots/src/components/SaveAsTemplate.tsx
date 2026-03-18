import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Save, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIES = ["Strategy", "Marketing & Growth", "Operations", "Finance"];

interface SaveAsTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultObjective?: string;
  defaultBots?: string[];
}

export function SaveAsTemplateModal({
  open,
  onOpenChange,
  defaultObjective = "",
  defaultBots = [],
}: SaveAsTemplateModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Strategy");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${BASE}/api/mission-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || `Custom template based on: ${defaultObjective.slice(0, 80)}`,
          category,
          recommendedBots: defaultBots,
          objectiveTemplate: defaultObjective,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save template");
      }

      toast({ title: "Template saved", description: `"${name}" added to your mission templates.` });
      onOpenChange(false);
      setName("");
      setDescription("");
      setCategory("Strategy");
    } catch (err) {
      toast({
        title: "Failed to save template",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-primary/30">
        <DialogTitle className="font-display text-lg text-primary flex items-center gap-2">
          <Save className="w-5 h-5" />
          Save as Template
        </DialogTitle>
        <DialogDescription className="text-muted-foreground font-tech text-sm">
          Save this mission objective as a reusable template for your team.
        </DialogDescription>

        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-widest mb-1 block">
              Template Name *
            </label>
            <Input
              placeholder="e.g. Q4 Sales Push Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-black/40 border-border/40 font-tech"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-widest mb-1 block">
              Description
            </label>
            <Input
              placeholder="Brief description of when to use this template..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-black/40 border-border/40 font-tech"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-widest mb-1 block">
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-black/40 border-border/40 font-tech">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="font-tech">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {defaultObjective && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs font-tech font-semibold text-primary/60 uppercase tracking-widest mb-1">
                Objective Template
              </p>
              <p className="text-sm font-tech text-foreground/80 leading-relaxed line-clamp-3">
                {defaultObjective}
              </p>
            </div>
          )}

          {defaultBots.length > 0 && (
            <div className="text-xs font-tech text-muted-foreground">
              Recommended bots: {defaultBots.join(", ")}
            </div>
          )}

          <Button
            variant="glow"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full font-tech tracking-wider"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
