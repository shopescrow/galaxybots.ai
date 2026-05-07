import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Plus,
  ArrowLeft,
  Loader2,
  Trash2,
  Send,
  Trophy,
  XCircle,
  Share2,
  Copy,
  Check,
  Sparkles,
  Presentation,
  FileQuestion,
  ChevronRight,
  Clock,
  Edit3,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ProposalSection {
  id: string;
  title: string;
  content: string;
  order: number;
  speakerNotes?: string;
}

interface Proposal {
  id: number;
  clientId: number;
  prospectName: string;
  prospectIndustry: string | null;
  type: string;
  status: string;
  sections: ProposalSection[];
  prospectDetails: Record<string, unknown>;
  shareToken: string | null;
  value: string | null;
  sentAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  won: "bg-green-500/10 text-green-400 border-green-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
};

const typeIcons: Record<string, React.ElementType> = {
  proposal: FileText,
  pitch: Presentation,
  rfp: FileQuestion,
};

function ProposalTracker({ onSelect, onCreate }: { onSelect: (id: number) => void; onCreate: () => void }) {
  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ["proposals"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/proposals`);
      if (!res.ok) throw new Error("Failed to fetch proposals");
      return res.json();
    },
  });

  const stats = {
    total: proposals.length,
    draft: proposals.filter((p) => p.status === "draft").length,
    sent: proposals.filter((p) => p.status === "sent").length,
    won: proposals.filter((p) => p.status === "won").length,
    lost: proposals.filter((p) => p.status === "lost").length,
  };

  const winRate = stats.won + stats.lost > 0
    ? Math.round((stats.won / (stats.won + stats.lost)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Proposal Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate AI-powered proposals, pitch decks, and RFP responses
          </p>
        </div>
        <Button onClick={onCreate} variant="glow" className="gap-2">
          <Plus className="w-4 h-4" /> New Proposal
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Draft", value: stats.draft, color: "text-muted-foreground" },
          { label: "Sent", value: stats.sent, color: "text-blue-400" },
          { label: "Won", value: stats.won, color: "text-green-400" },
          { label: "Win Rate", value: `${winRate}%`, color: "text-primary" },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : proposals.length === 0 ? (
        <Card className="border-dashed border-2 border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-display font-semibold mb-2">No proposals yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first AI-powered proposal
            </p>
            <Button onClick={onCreate} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Create Proposal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => {
            const Icon = typeIcons[p.type] || FileText;
            const daysSinceSent = p.sentAt
              ? Math.floor((Date.now() - new Date(p.sentAt).getTime()) / 86400000)
              : null;

            return (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => onSelect(p.id)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{p.prospectName}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="capitalize">{p.type}</span>
                      {p.prospectIndustry && (
                        <>
                          <span>·</span>
                          <span>{p.prospectIndustry}</span>
                        </>
                      )}
                      {p.value && (
                        <>
                          <span>·</span>
                          <span>${Number(p.value).toLocaleString()}</span>
                        </>
                      )}
                      {daysSinceSent !== null && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {daysSinceSent}d since sent
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-[10px] shrink-0 ${statusColors[p.status] || ""}`}>
                    {p.status}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProposalWizard({ onComplete, onCancel }: { onComplete: (id: number) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    prospectName: "",
    prospectIndustry: "",
    servicePitch: "",
    painPoints: "",
    desiredOutcome: "",
    type: "proposal" as string,
    rfpText: "",
  });
  const [generatedSections, setGeneratedSections] = useState<ProposalSection[]>([]);
  const [generatingStatus, setGeneratingStatus] = useState<{ current: number; total: number; title: string } | null>(null);
  const [rfpAnalysis, setRfpAnalysis] = useState<{
    requirements?: { id: string; category: string; requirement: string; priority: string }[];
    questions?: { id: string; question: string; suggestedAnswer: string }[];
    complianceNotes?: string;
  } | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectName: form.prospectName,
          prospectIndustry: form.prospectIndustry || null,
          type: form.type,
          prospectDetails: {
            servicePitch: form.servicePitch,
            painPoints: form.painPoints,
            desiredOutcome: form.desiredOutcome,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to create proposal");
      return res.json();
    },
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const streamGenerate = async (proposalId: number) => {
    setIsGenerating(true);
    setGeneratedSections([]);
    setGeneratingStatus(null);

    const res = await fetch(`${BASE}/api/proposals/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectName: form.prospectName,
        prospectIndustry: form.prospectIndustry,
        servicePitch: form.servicePitch,
        painPoints: form.painPoints,
        desiredOutcome: form.desiredOutcome,
        type: form.type,
        proposalId,
        rfpText: form.type === "rfp" ? form.rfpText : undefined,
        rfpAnalysis: form.type === "rfp" ? rfpAnalysis : undefined,
      }),
    });

    if (!res.ok || !res.body) {
      setIsGenerating(false);
      throw new Error("Generation failed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7);
        } else if (line.startsWith("data: ") && currentEvent) {
          try {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === "progress") {
              setGeneratingStatus({
                current: data.sectionIndex + 1,
                total: 0,
                title: data.sectionTitle,
              });
            } else if (currentEvent === "section") {
              setGeneratedSections((prev) => [...prev, data.section]);
              setGeneratingStatus({
                current: data.sectionIndex + 1,
                total: data.total,
                title: data.section.title,
              });
            } else if (currentEvent === "status") {
              setGeneratingStatus({
                current: 0,
                total: data.total || 0,
                title: data.message,
              });
            } else if (currentEvent === "error") {
              throw new Error(data.message);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Generation failed") {
              console.warn("SSE parse error:", e);
            } else {
              throw e;
            }
          }
          currentEvent = "";
        }
      }
    }

    setIsGenerating(false);
  };

  const rfpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/proposals/analyze-rfp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfpText: form.rfpText }),
      });
      if (!res.ok) throw new Error("RFP analysis failed");
      return res.json();
    },
    onSuccess: (data) => {
      setRfpAnalysis(data);
      if (data.sections) {
        setGeneratedSections(data.sections);
      }
    },
  });

  const handleGenerate = async () => {
    try {
      const proposal = await createMutation.mutateAsync();
      setStep(2);
      await streamGenerate(proposal.id);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      setStep(3);
      onComplete(proposal.id);
    } catch (err) {
      toast({ title: "Generation failed", description: "Please try again.", variant: "destructive" });
      setStep(1);
    }
  };

  const handleRfpAnalyze = async () => {
    try {
      await rfpMutation.mutateAsync();
      setStep(1.5);
    } catch {
      toast({ title: "RFP analysis failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <h1 className="text-2xl font-display font-bold">New Proposal</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {["Select Type", form.type === "rfp" ? "Paste RFP" : "Details", "Generating", "Done"].map((label, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${step >= i ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { type: "proposal", icon: FileText, title: "Business Proposal", desc: "Full proposal with executive summary, scope, timeline, and pricing" },
            { type: "pitch", icon: Presentation, title: "Pitch Deck", desc: "Slide-by-slide outline with speaker notes for presentations" },
            { type: "rfp", icon: FileQuestion, title: "RFP Response", desc: "Point-by-point response to a Request for Proposal" },
          ].map(({ type, icon: Icon, title, desc }) => (
            <Card
              key={type}
              className={`cursor-pointer transition-all hover:border-primary/50 ${form.type === type ? "border-primary bg-primary/5" : ""}`}
              onClick={() => { setForm({ ...form, type }); setStep(1); }}
            >
              <CardContent className="p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold mb-2">{title}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {step === 1 && form.type === "rfp" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Paste RFP Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>RFP Content</Label>
              <Textarea
                value={form.rfpText}
                onChange={(e) => setForm({ ...form, rfpText: e.target.value })}
                placeholder="Paste the RFP text here..."
                rows={12}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Prospect Name</Label>
                <Input
                  value={form.prospectName}
                  onChange={(e) => setForm({ ...form, prospectName: e.target.value })}
                  placeholder="e.g., Acme Corp"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Industry</Label>
                <Input
                  value={form.prospectIndustry}
                  onChange={(e) => setForm({ ...form, prospectIndustry: e.target.value })}
                  placeholder="e.g., Healthcare"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button
                onClick={handleRfpAnalyze}
                disabled={!form.rfpText.trim() || !form.prospectName.trim() || rfpMutation.isPending}
                className="gap-2"
              >
                {rfpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Analyze RFP
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1.5 && rfpAnalysis && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">RFP Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {rfpAnalysis.requirements && rfpAnalysis.requirements.length > 0 && (
                <div>
                  <h3 className="text-sm font-tech text-muted-foreground uppercase tracking-wider mb-2">Key Requirements</h3>
                  <div className="space-y-2">
                    {rfpAnalysis.requirements.map((r) => (
                      <div key={r.id} className="flex items-start gap-2 text-sm">
                        <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                          {r.priority}
                        </Badge>
                        <span>{r.requirement}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rfpAnalysis.complianceNotes && (
                <div>
                  <h3 className="text-sm font-tech text-muted-foreground uppercase tracking-wider mb-2">Compliance Notes</h3>
                  <p className="text-sm text-muted-foreground">{rfpAnalysis.complianceNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={handleGenerate} disabled={createMutation.isPending || isGenerating} className="gap-2">
              {(createMutation.isPending || isGenerating)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              Generate RFP Response
            </Button>
          </div>
        </div>
      )}

      {step === 1 && form.type !== "rfp" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prospect Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Prospect Name *</Label>
                <Input
                  value={form.prospectName}
                  onChange={(e) => setForm({ ...form, prospectName: e.target.value })}
                  placeholder="e.g., Acme Corp"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Industry</Label>
                <Input
                  value={form.prospectIndustry}
                  onChange={(e) => setForm({ ...form, prospectIndustry: e.target.value })}
                  placeholder="e.g., Healthcare, SaaS, Retail"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Service Being Proposed</Label>
              <Input
                value={form.servicePitch}
                onChange={(e) => setForm({ ...form, servicePitch: e.target.value })}
                placeholder="e.g., AI-powered customer support automation"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Key Pain Points</Label>
              <Textarea
                value={form.painPoints}
                onChange={(e) => setForm({ ...form, painPoints: e.target.value })}
                placeholder="What challenges does the prospect face?"
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Desired Outcome</Label>
              <Textarea
                value={form.desiredOutcome}
                onChange={(e) => setForm({ ...form, desiredOutcome: e.target.value })}
                placeholder="What does success look like for this prospect?"
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button
                onClick={handleGenerate}
                disabled={!form.prospectName.trim() || createMutation.isPending || isGenerating}
                className="gap-2"
              >
                {(createMutation.isPending || isGenerating)
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Sparkles className="w-4 h-4" />}
                Generate {form.type === "pitch" ? "Pitch Deck" : "Proposal"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
              <p className="text-lg font-display font-semibold mb-1">
                Generating your {form.type === "pitch" ? "pitch deck" : form.type === "rfp" ? "RFP response" : "proposal"}...
              </p>
              {generatingStatus && (
                <p className="text-sm text-muted-foreground">
                  {generatingStatus.total > 0
                    ? `Section ${generatingStatus.current} of ${generatingStatus.total}: ${generatingStatus.title}`
                    : generatingStatus.title}
                </p>
              )}
              {generatingStatus && generatingStatus.total > 0 && (
                <div className="w-full max-w-xs mt-3">
                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(generatingStatus.current / generatingStatus.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    {Math.round((generatingStatus.current / generatingStatus.total) * 100)}% complete
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {generatedSections.length > 0 && (
            <div className="space-y-3">
              {generatedSections.map((section) => (
                <Card key={section.id} className="border-border/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <CardTitle className="text-sm font-display">{section.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground line-clamp-3">{section.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProposalEditor({ proposalId, onBack }: { proposalId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: proposal, isLoading } = useQuery<Proposal>({
    queryKey: ["proposal", proposalId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/proposals/${proposalId}`);
      if (!res.ok) throw new Error("Failed to fetch proposal");
      return res.json();
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ sectionId, content, speakerNotes }: { sectionId: string; content: string; speakerNotes?: string }) => {
      const res = await fetch(`${BASE}/api/proposals/${proposalId}/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, speakerNotes }),
      });
      if (!res.ok) throw new Error("Failed to update section");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] });
      setEditingSection(null);
      toast({ title: "Section updated" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`${BASE}/api/proposals/${proposalId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Status updated" });
    },
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/proposals/${proposalId}/share`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to share");
      return res.json();
    },
    onSuccess: (data) => {
      const url = `${window.location.origin}${BASE}/proposals/shared/${data.shareToken}`;
      setShareUrl(url);
      setShareDialogOpen(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/proposals/${proposalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      onBack();
      toast({ title: "Proposal deleted" });
    },
  });

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading || !proposal) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isPitch = proposal.type === "pitch";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Badge className={`text-[10px] ${statusColors[proposal.status] || ""}`}>
            {proposal.status}
          </Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{proposal.type}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {proposal.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("sent")} className="gap-1">
              <Send className="w-4 h-4" /> Mark Sent
            </Button>
          )}
          {proposal.status === "sent" && (
            <>
              <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("won")} className="gap-1 text-green-400 border-green-500/30 hover:bg-green-500/10">
                <Trophy className="w-4 h-4" /> Won
              </Button>
              <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("lost")} className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10">
                <XCircle className="w-4 h-4" /> Lost
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => shareMutation.mutate()} disabled={shareMutation.isPending} className="gap-1">
            {shareMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (confirm("Delete this proposal?")) deleteMutation.mutate(); }}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold">{proposal.prospectName}</h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          {proposal.prospectIndustry && <span>{proposal.prospectIndustry}</span>}
          {proposal.value && <span>· ${Number(proposal.value).toLocaleString()}</span>}
          <span>· Created {new Date(proposal.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {(!proposal.sections || proposal.sections.length === 0) ? (
        <Card className="border-dashed border-2 border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-display font-semibold mb-2">No content generated yet</p>
            <p className="text-sm text-muted-foreground">This proposal has no sections.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...proposal.sections].sort((a, b) => a.order - b.order).map((section) => (
            <Card key={section.id} className="border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-display">{section.title}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (editingSection === section.id) {
                        setEditingSection(null);
                      } else {
                        setEditingSection(section.id);
                        setEditContent(section.content);
                        setEditNotes(section.speakerNotes || "");
                      }
                    }}
                    className="gap-1 text-xs"
                  >
                    <Edit3 className="w-3 h-3" /> {editingSection === section.id ? "Cancel" : "Edit"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {editingSection === section.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                    />
                    {isPitch && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Speaker Notes</Label>
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                          className="mt-1 font-mono text-sm"
                          placeholder="What to say during this slide..."
                        />
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={() => updateSectionMutation.mutate({
                        sectionId: section.id,
                        content: editContent,
                        speakerNotes: isPitch ? editNotes : undefined,
                      })}
                      disabled={updateSectionMutation.isPending}
                      className="gap-1"
                    >
                      {updateSectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{section.content}</div>
                    {isPitch && section.speakerNotes && (
                      <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/30">
                        <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider mb-1">Speaker Notes</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{section.speakerNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with your prospect. They will see a clean, formatted view of the proposal.
            </p>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-xs" />
              <Button size="sm" variant="outline" onClick={copyUrl}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProposalStudio() {
  const [view, setView] = useState<"list" | "wizard" | "editor">("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-5xl">
        {view === "list" && (
          <ProposalTracker
            onSelect={(id) => { setSelectedId(id); setView("editor"); }}
            onCreate={() => setView("wizard")}
          />
        )}
        {view === "wizard" && (
          <ProposalWizard
            onComplete={(id) => { setSelectedId(id); setView("editor"); }}
            onCancel={() => setView("list")}
          />
        )}
        {view === "editor" && selectedId && (
          <ProposalEditor
            proposalId={selectedId}
            onBack={() => { setSelectedId(null); setView("list"); }}
          />
        )}
      </div>
    </AppLayout>
  );
}
