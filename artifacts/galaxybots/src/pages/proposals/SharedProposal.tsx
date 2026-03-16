import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Loader2, FileText, Presentation, FileQuestion } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ProposalSection {
  id: string;
  title: string;
  content: string;
  order: number;
  speakerNotes?: string;
}

interface SharedProposalData {
  prospectName: string;
  prospectIndustry: string | null;
  type: string;
  sections: ProposalSection[];
  createdAt: string;
}

export default function SharedProposal() {
  const params = useParams<{ token: string }>();

  const { data: proposal, isLoading, error } = useQuery<SharedProposalData>({
    queryKey: ["shared-proposal", params.token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/proposals/shared/${params.token}`);
      if (!res.ok) throw new Error("Proposal not found");
      return res.json();
    },
    enabled: !!params.token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-display font-bold mb-2">Proposal Not Found</h1>
          <p className="text-sm text-muted-foreground">This proposal link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const Icon = proposal.type === "pitch" ? Presentation : proposal.type === "rfp" ? FileQuestion : FileText;
  const sorted = [...(proposal.sections || [])].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-tech text-primary uppercase tracking-wider mb-4">
            <Icon className="w-3.5 h-3.5" />
            {proposal.type === "pitch" ? "Pitch Deck" : proposal.type === "rfp" ? "RFP Response" : "Proposal"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">
            {proposal.prospectName}
          </h1>
          {proposal.prospectIndustry && (
            <p className="text-muted-foreground">{proposal.prospectIndustry}</p>
          )}
        </div>

        <div className="space-y-8">
          {sorted.map((section, index) => (
            <section key={section.id} className="group">
              {index > 0 && <hr className="border-border/30 mb-8" />}
              <h2 className="text-xl font-display font-semibold mb-4 text-primary/90">
                {section.title}
              </h2>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 pt-8 border-t border-border/30 text-center">
          <p className="text-xs text-muted-foreground font-tech">
            Generated with GalaxyBots.ai Proposal Studio
          </p>
        </footer>
      </div>
    </div>
  );
}
