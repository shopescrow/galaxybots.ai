import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

const INDUSTRIES = [
  "Technology", "Healthcare", "Finance", "E-commerce", "Education",
  "Real Estate", "Marketing", "Legal", "Manufacturing", "Hospitality",
  "SaaS", "Consulting", "Media", "Non-profit", "Other",
];

export default function NewClient() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [tagline, setTagline] = useState("");
  const [apiKeyResult, setApiKeyResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => api.createClient({ name, industry, website: website || undefined, tagline: tagline || undefined }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setApiKeyResult(data.apiKey);
      toast({ title: "Client created", description: `${name} has been added with an API key.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCopy = () => {
    if (apiKeyResult) {
      navigator.clipboard.writeText(apiKeyResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (apiKeyResult) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <CardTitle>Client Created</CardTitle>
            </div>
            <CardDescription>Save this API key now — it will not be shown again.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">API Key</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3 py-2 rounded bg-background border text-sm font-mono break-all">
                  {apiKeyResult}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button onClick={() => navigate("/clients")} className="w-full">
              Go to Clients
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Client</h1>
          <p className="text-muted-foreground text-sm">Register a new content client</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry *</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="We build the future" />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name || !industry || createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? "Creating..." : "Create Client"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
