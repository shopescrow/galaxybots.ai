import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Sparkles, Copy, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCaptionGenerator } from "@/hooks/useCaptionGenerator";

const formSchema = z.object({
  topic: z
    .string()
    .min(5, "Topic must be at least 5 characters.")
    .max(600, "Topic cannot exceed 600 characters."),
  tone: z.string().min(1, "Please select a tone."),
  platform: z.string().min(1, "Please select a platform."),
  count: z.number().min(1).max(8),
});

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "playful", label: "Playful" },
  { value: "bold", label: "Bold" },
  { value: "inspirational", label: "Inspirational" },
  { value: "minimal", label: "Minimal" },
  { value: "witty", label: "Witty" },
];

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X (Twitter)" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
];

export default function Home() {
  const { toast } = useToast();
  const { generate, isLoading, error, data } = useCaptionGenerator();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      tone: "witty",
      platform: "instagram",
      count: 3,
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await generate(values);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast({
      title: "Copied!",
      description: "Caption copied to clipboard.",
      duration: 2000,
    });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background selection:bg-primary selection:text-primary-foreground flex flex-col items-center justify-center p-4 md:p-8">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* LEFT COLUMN: THE FORGE */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          <div>
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-6 text-primary">
              <Sparkles className="w-8 h-8" />
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground mb-4 leading-none">
              Caption Forge
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Your vending machine for scroll-stopping words. Type a topic, pick your
              vibe, and forge brilliant captions in seconds.
            </p>
          </div>

          <div className="bg-card border shadow-xl rounded-3xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-primary"></div>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 relative z-10">
                <FormField
                  control={form.control}
                  name="topic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">What's the post about?</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Launching a new line of organic coffee beans sourced from Colombia..."
                          className="resize-none min-h-[120px] text-base leading-relaxed p-4 rounded-xl"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Platform</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-xl h-12">
                              <SelectValue placeholder="Select platform" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PLATFORMS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Vibe</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-xl h-12">
                              <SelectValue placeholder="Select tone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TONES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="count"
                  render={({ field }) => (
                    <FormItem className="pt-2">
                      <div className="flex justify-between items-center mb-4">
                        <FormLabel className="font-semibold">Number of Captions</FormLabel>
                        <span className="bg-secondary text-secondary-foreground font-bold px-3 py-1 rounded-full text-sm">
                          {field.value}
                        </span>
                      </div>
                      <FormControl>
                        <Slider
                          min={1}
                          max={8}
                          step={1}
                          value={[field.value]}
                          onValueChange={(vals) => field.onChange(vals[0])}
                          className="py-2"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-lg font-bold h-14 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Forging...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Generate Captions
                    </>
                  )}
                </Button>
                {error && (
                  <p className="text-destructive text-sm text-center font-medium mt-2">
                    {error}
                  </p>
                )}
              </form>
            </Form>
          </div>
        </div>

        {/* RIGHT COLUMN: THE RESULTS */}
        <div className="lg:col-span-7 flex flex-col">
          {!data && !isLoading && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-muted rounded-3xl bg-muted/20">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
                <RefreshCw className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">Awaiting Instructions</h3>
              <p className="text-muted-foreground max-w-sm">
                Fill out the forge parameters on the left and hit generate to see the magic happen.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 border-2 border-transparent rounded-3xl">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
              <h3 className="text-xl font-bold text-foreground mb-2 animate-pulse">
                Crafting your words...
              </h3>
              <p className="text-muted-foreground">This usually takes just a few seconds.</p>
            </div>
          )}

          {data && !isLoading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b">
                <h2 className="text-2xl font-bold">Your Captions</h2>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-bold uppercase tracking-wider">
                    {data.platform}
                  </span>
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-wider">
                    {data.tone}
                  </span>
                </div>
              </div>

              <div className="grid gap-6">
                {data.captions.map((caption, i) => (
                  <div
                    key={i}
                    className="group relative bg-card border rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <p className="text-lg text-foreground whitespace-pre-wrap leading-relaxed pr-12">
                      {caption}
                    </p>
                    <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant={copiedIndex === i ? "default" : "secondary"}
                        onClick={() => copyToClipboard(caption, i)}
                        className="rounded-full shadow-sm"
                        title="Copy caption"
                      >
                        {copiedIndex === i ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
