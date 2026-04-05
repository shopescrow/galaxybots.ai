import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Keyboard } from "lucide-react";

interface ShortcutRow {
  keys: string[];
  description: string;
  context?: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ["⌘", "K"], description: "Open command palette" },
  { keys: ["⌘", "B"], description: "Open Boardroom" },
  { keys: ["⌘", "D"], description: "Deploy Team" },
  { keys: ["⌘", "1-9"], description: "Switch to client by position" },
  { keys: ["⌘", "↵"], description: "Send current message", context: "In bot chat" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Close overlay / go back" },
];

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-primary/30">
        <DialogTitle className="flex items-center gap-2 font-display text-lg text-primary">
          <Keyboard className="w-5 h-5" />
          Keyboard Shortcuts
        </DialogTitle>

        <div className="space-y-1 mt-2">
          {SHORTCUTS.map((shortcut, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-2.5 px-1 border-b border-border/30 last:border-0"
            >
              <div>
                <p className="text-sm font-tech text-foreground/90">{shortcut.description}</p>
                {shortcut.context && (
                  <p className="text-xs text-muted-foreground font-tech">{shortcut.context}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, ki) => (
                  <kbd
                    key={ki}
                    className="inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded border border-border bg-muted px-1.5 font-mono text-xs text-foreground/80"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground font-tech text-center mt-2">
          Press <kbd className="inline rounded border bg-muted px-1 font-mono text-[10px]">?</kbd> anywhere (outside text inputs) to toggle this overlay
        </p>
      </DialogContent>
    </Dialog>
  );
}
