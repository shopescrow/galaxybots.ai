import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanLine, BarChart2 } from "lucide-react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AeoScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUrl?: string;
}

export function AeoScanModal({ open, onOpenChange, defaultUrl = "" }: AeoScanModalProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const token = localStorage.getItem("auth_token");
    setIsSubmitting(true);

    try {
      const res = await fetch(`${BASE}/api/aeo/scan/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "AEO Scan Queued",
          description: data.message || "Your scan has been queued. Results will appear in the AEO Intelligence tab.",
        });
        onOpenChange(false);
        navigate("/clients");
      } else if (res.status === 422) {
        toast({
          title: "Integration Required",
          description: data.error || "Connect PirateMonster to enable AEO scans.",
          variant: "destructive",
        });
        onOpenChange(false);
        navigate("/integrations");
      } else {
        toast({
          title: "Scan Request Failed",
          description: data.error || "Could not queue AEO scan. Try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Request Failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-tech">
            <ScanLine className="w-5 h-5 text-blue-400" />
            Request AEO Scan
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="scan-url" className="font-tech text-xs text-muted-foreground uppercase tracking-widest mb-1.5 block">
              URL to Scan
            </Label>
            <Input
              id="scan-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page-to-scan"
              type="url"
              autoFocus
              className="font-tech"
            />
            <p className="text-xs text-muted-foreground mt-1.5 font-tech">
              PirateMonster will analyze this URL for AI Engine Optimization signals and update your AEO Intelligence dashboard.
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <BarChart2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <p className="text-xs text-blue-300/80 font-tech">
              Requires an active PirateMonster integration. Results appear in your client's AEO Intelligence tab.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-tech">
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim() || isSubmitting} variant="glow" className="font-tech">
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Queuing...</>
              ) : (
                <><ScanLine className="w-4 h-4 mr-2" />Request Scan</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
