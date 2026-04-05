import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Library,
  Clock,
  Bot,
  ChevronRight,
  X,
  Loader2,
  ArrowRight,
  Target,
  CheckCircle2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MissionTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  estimatedDuration: string | null;
  recommendedBots: string[];
  objectiveTemplate: string;
  successCriteria: string | null;
  isBuiltIn: boolean;
  createdBy: string | null;
}

const CATEGORIES = ["Strategy", "Marketing & Growth", "Operations", "Finance"];

const CATEGORY_COLORS: Record<string, string> = {
  "Strategy": "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "Marketing & Growth": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "Operations": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  "Finance": "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

function applyVariables(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`);
}

interface TemplateDetailModalProps {
  template: MissionTemplate;
  onClose: () => void;
  onLaunch: (objective: string, recommendedBots: string[]) => void;
}

function TemplateDetailModal({ template, onClose, onLaunch }: TemplateDetailModalProps) {
  const variables = extractVariables(template.objectiveTemplate);
  const [values, setValues] = useState<Record<string, string>>({});
  const preview = applyVariables(template.objectiveTemplate, values);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-background/95 backdrop-blur-xl border-primary/30">
        <DialogTitle className="font-display text-lg text-primary">{template.name}</DialogTitle>
        <DialogDescription className="text-muted-foreground font-tech text-sm">
          {template.description}
        </DialogDescription>

        <div className="space-y-4 mt-2">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs", CATEGORY_COLORS[template.category] || "bg-primary/10 text-primary border-primary/30")}
            >
              {template.category}
            </Badge>
            {template.estimatedDuration && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {template.estimatedDuration}
              </Badge>
            )}
          </div>

          <div>
            <p className="text-xs font-tech font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              Recommended Bots
            </p>
            <div className="flex flex-wrap gap-1">
              {template.recommendedBots.map((bot) => (
                <Badge key={bot} variant="secondary" className="text-xs font-tech">
                  {bot}
                </Badge>
              ))}
            </div>
          </div>

          {template.successCriteria && (
            <div>
              <p className="text-xs font-tech font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Success Criteria
              </p>
              <p className="text-sm text-foreground/80 font-tech">{template.successCriteria}</p>
            </div>
          )}

          {variables.length > 0 && (
            <div>
              <p className="text-xs font-tech font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Fill in Variables
              </p>
              <div className="space-y-2">
                {variables.map((variable) => (
                  <div key={variable}>
                    <label className="text-xs font-tech text-muted-foreground capitalize mb-1 block">
                      {variable.replace(/([A-Z])/g, " $1").trim()}
                    </label>
                    <Input
                      placeholder={`Enter ${variable.replace(/([A-Z])/g, " $1").trim().toLowerCase()}...`}
                      value={values[variable] || ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [variable]: e.target.value }))}
                      className="bg-black/40 border-border/40 text-sm font-tech"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-xs font-tech font-semibold text-primary/60 uppercase tracking-widest mb-1">
              Objective Preview
            </p>
            <p className="text-sm font-tech text-foreground/90 leading-relaxed">{preview}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 font-tech">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              variant="glow"
              onClick={() => onLaunch(preview, template.recommendedBots)}
              className="flex-1 font-tech tracking-wider"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Launch Mission
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface MissionTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (objective: string, recommendedBots: string[]) => void;
}

export function MissionTemplatesModal({ open, onOpenChange, onLaunch }: MissionTemplatesModalProps) {
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("Strategy");
  const [selectedTemplate, setSelectedTemplate] = useState<MissionTemplate | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch(`${BASE}/api/mission-templates`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        toast({ title: "Failed to load templates", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filteredTemplates = templates.filter((t) => t.category === activeCategory);

  const handleLaunch = (objective: string, recommendedBots: string[]) => {
    setSelectedTemplate(null);
    onOpenChange(false);
    onLaunch(objective, recommendedBots);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl bg-background/95 backdrop-blur-xl border-primary/30 h-[80vh] flex flex-col p-0">
          <div className="px-6 pt-6 pb-4 border-b border-border/40">
            <DialogTitle className="font-display text-xl text-primary flex items-center gap-2">
              <Library className="w-6 h-6" />
              Mission Templates
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-tech text-sm mt-1">
              Launch sophisticated multi-bot missions with proven templates.
            </DialogDescription>
          </div>

          <div className="flex border-b border-border/40 px-6 gap-1 overflow-x-auto flex-shrink-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-3 py-2.5 text-xs font-tech font-semibold uppercase tracking-widest transition-colors whitespace-nowrap border-b-2 -mb-px",
                  activeCategory === cat
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground font-tech">
                No templates in this category yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="p-4 bg-black/30 border-border/40 hover:border-primary/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                            {template.name}
                          </h3>
                          {template.isBuiltIn && (
                            <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary/70">
                              Built-in
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-tech mb-2 line-clamp-2">
                          {template.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {template.recommendedBots.slice(0, 3).map((bot) => (
                            <Badge key={bot} variant="secondary" className="text-[10px] font-tech">
                              {bot}
                            </Badge>
                          ))}
                          {template.recommendedBots.length > 3 && (
                            <Badge variant="secondary" className="text-[10px] font-tech">
                              +{template.recommendedBots.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {template.estimatedDuration && (
                          <span className="text-[10px] font-tech text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {template.estimatedDuration}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedTemplate && (
        <TemplateDetailModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onLaunch={handleLaunch}
        />
      )}
    </>
  );
}
