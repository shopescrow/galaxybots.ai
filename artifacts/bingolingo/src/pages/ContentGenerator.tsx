import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link, useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Save, Send, Loader2, X } from "lucide-react";

const CONTENT_TYPES = [
  { value: "blog", label: "Blog Post" },
  { value: "linkedin", label: "LinkedIn Article" },
  { value: "twitter", label: "Twitter/X Thread" },
  { value: "email", label: "Email Newsletter" },
  { value: "press_release", label: "Press Release" },
  { value: "case_study", label: "Case Study" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "conversational", label: "Conversational" },
  { value: "thought_leadership", label: "Thought Leadership" },
  { value: "educational", label: "Educational" },
  { value: "bold", label: "Bold / Edgy" },
];

export default function ContentGenerator() {
  const [, params] = useRoute("/clients/:id/generate");
  const clientId = Number(params?.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [contentType, setContentType] = useState("blog");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [generatedContent, setGeneratedContent] = useState<any>(null);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableBody, setEditableBody] = useState("");

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.getClient(clientId),
    enabled: !!clientId,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateContent({ clientId, contentType, topic, tone, keywords }),
    onSuccess: (data) => {
      setGeneratedContent(data);
      setEditableTitle(data.title);
      setEditableBody(data.body);
      toast({ title: "Content generated" });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (status: string) =>
      api.saveContent({
        clientId,
        type: contentType,
        title: editableTitle,
        slug: generatedContent?.slug,
        body: editableBody,
        metaDescription: generatedContent?.metaDescription,
        topic,
        tone,
        keywords,
        status,
      }),
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["content", clientId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: status === "published" ? "Published!" : "Saved as draft" });
      navigate(`/clients/${clientId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setKeywordInput("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generate Content</h1>
          <p className="text-muted-foreground text-sm">{client?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Content Type</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Topic *</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., How AI is transforming healthcare" />
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Keywords</Label>
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                  placeholder="Add keyword..."
                />
                <Button type="button" variant="outline" onClick={addKeyword}>Add</Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1">
                      {kw}
                      <button onClick={() => setKeywords(keywords.filter((k) => k !== kw))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!topic || generateMutation.isPending}
              className="w-full gap-2"
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generate Content</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {!generatedContent ? (
              <div className="text-center py-16 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Configure your content and click Generate to see a preview.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    value={editableBody}
                    onChange={(e) => setEditableBody(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => saveMutation.mutate("draft")}
                    variant="outline"
                    className="flex-1 gap-2"
                    disabled={saveMutation.isPending}
                  >
                    <Save className="h-4 w-4" /> Save Draft
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate("published")}
                    className="flex-1 gap-2"
                    disabled={saveMutation.isPending}
                  >
                    <Send className="h-4 w-4" /> Publish
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
