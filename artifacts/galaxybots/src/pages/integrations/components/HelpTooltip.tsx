import { useState } from "react";
import { HelpCircle, ExternalLink as ExternalLinkIcon } from "lucide-react";

export function HelpTooltip({ text, url }: { text: string; url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        aria-label="Where do I find this?"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-5 z-20 w-64 rounded-lg border border-border/60 bg-background shadow-lg p-3 text-xs space-y-2">
            <p className="font-medium text-foreground">Where do I find this?</p>
            <p className="text-muted-foreground leading-relaxed">{text}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open documentation
              <ExternalLinkIcon className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
