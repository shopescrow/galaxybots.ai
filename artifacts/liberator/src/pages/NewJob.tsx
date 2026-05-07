import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateExtractionJob, getListExtractionJobsQueryKey, getGetExtractionStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Plus, X, Server, LayoutList, Contact2, Bot } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  sourceUrl: z.string().url("Must be a valid URL"),
  extractionType: z.enum(["table", "list", "contacts", "custom"]),
  instructions: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function NewJob() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<string[]>([""]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sourceUrl: "",
      extractionType: "table",
      instructions: "",
    },
  });

  const createJob = useCreateExtractionJob();

  const addField = () => setFields([...fields, ""]);
  const removeField = (index: number) => {
    if (fields.length > 1) {
      const newFields = [...fields];
      newFields.splice(index, 1);
      setFields(newFields);
    }
  };
  const updateField = (index: number, value: string) => {
    const newFields = [...fields];
    newFields[index] = value;
    setFields(newFields);
  };

  const onSubmit = (data: FormValues) => {
    const validFields = fields.filter(f => f.trim().length > 0);
    
    createJob.mutate(
      {
        data: {
          ...data,
          fields: validFields.length > 0 ? validFields : undefined,
        }
      },
      {
        onSuccess: (job) => {
          toast({
            title: "Job initialized",
            description: "Extraction job has been created and is pending execution.",
          });
          queryClient.invalidateQueries({ queryKey: getListExtractionJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetExtractionStatsQueryKey() });
          setLocation(`/jobs/${job.id}`);
        },
        onError: () => {
          toast({
            title: "Failed to create job",
            description: "There was an error initializing the extraction.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className="max-w-3xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">New Extraction Job</h1>
        <p className="text-muted-foreground mt-1">Configure target parameters and data structure.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Target Definition</CardTitle>
              <CardDescription>Where should Liberator extract data from?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Identifier</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. YC W24 Batch Companies" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sourceUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/data" className="bg-background font-mono text-sm" {...field} />
                    </FormControl>
                    <FormDescription>The entry point URL for the extraction.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle>Extraction Strategy</CardTitle>
              <CardDescription>Select the primary structural pattern of the target data.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="extractionType"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                      >
                        <FormItem>
                          <FormControl>
                            <RadioGroupItem value="table" className="sr-only" />
                          </FormControl>
                          <FormLabel className="cursor-pointer">
                            <div className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${field.value === 'table' ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50'}`}>
                              <Server className={`w-5 h-5 mt-0.5 ${field.value === 'table' ? 'text-primary' : 'text-muted-foreground'}`} />
                              <div>
                                <div className="font-semibold text-foreground">Tabular Data</div>
                                <div className="text-xs text-muted-foreground font-normal mt-1">Standard rows and columns, grids, or data tables.</div>
                              </div>
                            </div>
                          </FormLabel>
                        </FormItem>
                        
                        <FormItem>
                          <FormControl>
                            <RadioGroupItem value="list" className="sr-only" />
                          </FormControl>
                          <FormLabel className="cursor-pointer">
                            <div className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${field.value === 'list' ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50'}`}>
                              <LayoutList className={`w-5 h-5 mt-0.5 ${field.value === 'list' ? 'text-primary' : 'text-muted-foreground'}`} />
                              <div>
                                <div className="font-semibold text-foreground">List Items</div>
                                <div className="text-xs text-muted-foreground font-normal mt-1">Repeating card components or list rows (e.g. products, posts).</div>
                              </div>
                            </div>
                          </FormLabel>
                        </FormItem>

                        <FormItem>
                          <FormControl>
                            <RadioGroupItem value="contacts" className="sr-only" />
                          </FormControl>
                          <FormLabel className="cursor-pointer">
                            <div className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${field.value === 'contacts' ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50'}`}>
                              <Contact2 className={`w-5 h-5 mt-0.5 ${field.value === 'contacts' ? 'text-primary' : 'text-muted-foreground'}`} />
                              <div>
                                <div className="font-semibold text-foreground">Profiles / Contacts</div>
                                <div className="text-xs text-muted-foreground font-normal mt-1">People directories, team pages, or user profiles.</div>
                              </div>
                            </div>
                          </FormLabel>
                        </FormItem>

                        <FormItem>
                          <FormControl>
                            <RadioGroupItem value="custom" className="sr-only" />
                          </FormControl>
                          <FormLabel className="cursor-pointer">
                            <div className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${field.value === 'custom' ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50'}`}>
                              <Bot className={`w-5 h-5 mt-0.5 ${field.value === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
                              <div>
                                <div className="font-semibold text-foreground">Custom AI</div>
                                <div className="text-xs text-muted-foreground font-normal mt-1">Unstructured pages relying heavily on custom instructions.</div>
                              </div>
                            </div>
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle>Schema Definition</CardTitle>
              <CardDescription>Define the specific fields you want to extract.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium leading-none">Expected Fields</label>
                {fields.map((field, index) => (
                  <div key={index} className="flex gap-2">
                    <Input 
                      value={field}
                      onChange={(e) => updateField(index, e.target.value)}
                      placeholder={`e.g. ${index === 0 ? 'company_name' : index === 1 ? 'website_url' : 'field_name'}`}
                      className="bg-background font-mono text-sm"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="icon"
                      onClick={() => removeField(index)}
                      disabled={fields.length === 1}
                      className="shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  type="button" 
                  variant="secondary" 
                  size="sm" 
                  onClick={addField}
                  className="mt-2 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Field
                </Button>
              </div>

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AI Directives (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="e.g. Ignore sponsored results. Format all dates as YYYY-MM-DD. Only extract companies in the US." 
                        className="bg-background min-h-[100px] resize-y" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>Provide specific guidance to the vision model.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-secondary/30 border-t border-border py-4 px-6 flex justify-end gap-3">
              <Link href="/">
                <Button type="button" variant="ghost">Cancel</Button>
              </Link>
              <Button type="submit" disabled={createJob.isPending}>
                {createJob.isPending ? "Initializing..." : "Create Extraction Job"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
