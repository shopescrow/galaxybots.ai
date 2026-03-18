import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { Plus, Search, History, Loader2, ListChecks, ExternalLink, Activity, BarChart3, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ReviewQueue } from "@/pages/prospecting/ReviewQueue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

export function ObservabilityTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/prospecting/stats");
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;
  if (!stats) return null;

  const successRate = stats.totalProspects > 0 ? (stats.qualifiedCount / stats.totalProspects) * 100 : 0;
  const costPerQualified = stats.qualifiedCount > 0 ? stats.totalCost / stats.qualifiedCount : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Success Rate</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between">
              {successRate.toFixed(1)}%
              <TrendingUp className={`w-4 h-4 ${successRate > 40 ? "text-green-500" : "text-amber-500"}`} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={successRate} className="h-1" />
            <p className="text-[10px] text-muted-foreground mt-2">Target: &gt;40%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Confidence</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between">
              {(parseFloat(stats.avgConfidence || "0") * 100).toFixed(1)}%
              <Activity className="w-4 h-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={parseFloat(stats.avgConfidence || "0") * 100} className="h-1" />
            <p className="text-[10px] text-muted-foreground mt-2">Target: &gt;85%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cost / Qualified</CardDescription>
            <CardTitle className="text-2xl">{costPerQualified.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[10px] text-muted-foreground">Credits per qualified lead</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Review Queue Depth</CardDescription>
            <CardTitle className="text-2xl flex items-center justify-between">
              {stats.totalProspects > 0 ? ((stats.reviewNeeded / stats.totalProspects) * 100).toFixed(1) : 0}%
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={stats.totalProspects > 0 ? (stats.reviewNeeded / stats.totalProspects) * 100 : 0} className="h-1" />
            <p className="text-[10px] text-muted-foreground mt-2">{stats.reviewNeeded} records pending</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Error Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.errorBreakdown.map((e: any) => (
                <div key={e.category} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize">{e.category}</span>
                    <span>{e.count}</span>
                  </div>
                  <Progress value={(e.count / stats.totalProspects) * 100} className="h-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                Learning Agent: Active Patterns
              </CardTitle>
              <Button size="sm" variant="outline">Run Analysis</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.patterns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active patterns yet.</p>
              ) : (
                stats.patterns.map((p: any) => (
                  <div key={p.id} className="p-3 rounded-md bg-secondary/50 text-xs flex justify-between items-center">
                    <div>
                      <div className="font-mono text-primary">{p.domainRegex}</div>
                      <div className="text-muted-foreground truncate max-w-[200px]">{p.hintText}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{((p.successAfterHint / (p.timesApplied || 1)) * 100).toFixed(0)}%</div>
                      <div className="text-[10px] text-muted-foreground">Effectiveness</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Prospector() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState("50");
  
  const [prospects, setProspects] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [prospectsRes, jobsRes] = await Promise.all([
        fetch("/api/prospecting/prospects"),
        fetch("/api/prospecting/jobs")
      ]);
      
      if (prospectsRes.ok) setProspects(await prospectsRes.json());
      if (jobsRes.ok) setJobs(await jobsRes.json());
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      const hasRunningJobs = jobs.some(j => j.status === "pending" || j.status === "running");
      if (hasRunningJobs) fetchData();
    }, 10000);
    return () => clearInterval(interval);
  }, [jobs]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/prospecting/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `job_${Date.now()}`,
        },
        body: JSON.stringify({
          query,
          location,
          limit: parseInt(limit),
        }),
      });

      if (!response.ok) throw new Error("Failed to create job");

      const job = await response.json();
      toast({
        title: "Job Created",
        description: `Prospecting job #${job.id} has been initialized.`,
      });
      setIsModalOpen(false);
      setQuery("");
      setLocation("");
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initialize prospecting job.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "qualified": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Qualified</Badge>;
      case "enriched": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Enriched</Badge>;
      case "new": return <Badge variant="outline">New</Badge>;
      case "review_needed": return <Badge variant="destructive">Review Needed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.75) return "bg-green-500";
    if (score >= 0.60) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Prospector</h1>
            <p className="text-muted-foreground">
              Autonomous B2B intelligence engine discovering and qualifying leads 24/7.
            </p>
          </div>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateJob}>
                <DialogHeader>
                  <DialogTitle>Initialize Prospecting Job</DialogTitle>
                  <DialogDescription>
                    Define the parameters for the autonomous discovery agent.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="query">Search Query</Label>
                    <Input
                      id="query"
                      placeholder="e.g. SaaS companies in Austin"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location">Location (Optional)</Label>
                    <Input
                      id="location"
                      placeholder="e.g. Austin, TX"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="limit">Lead Limit</Label>
                    <Input
                      id="limit"
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      min="1"
                      max="1000"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Launch Discovery Agent
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="pipeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pipeline">
              <Search className="w-4 h-4 mr-2" />
              Discovery Pipeline
            </TabsTrigger>
            <TabsTrigger value="review">
              <ListChecks className="w-4 h-4 mr-2" />
              Review Queue
            </TabsTrigger>
            <TabsTrigger value="observability">
              <BarChart3 className="w-4 h-4 mr-2" />
              Observability
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" />
                    Discovery Pipeline
                  </CardTitle>
                  <CardDescription>
                    Live stream of discovered leads awaiting enrichment and qualification.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
                  ) : prospects.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <Search className="w-12 h-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                      <h3 className="text-lg font-medium">Pipeline Empty</h3>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        No prospects discovered yet. Launch a discovery job to start populating your intelligence engine.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>ICP Score</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Credits</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {prospects.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-medium">{p.companyName}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                {p.domain} <ExternalLink className="w-3 h-3" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{p.email || "—"}</div>
                              <div className="text-xs text-muted-foreground">{p.phone || "—"}</div>
                            </TableCell>
                            <TableCell>
                              <div className="w-24 space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span>{(p.confidenceScore * 100).toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${getConfidenceColor(p.confidenceScore)}`} 
                                    style={{ width: `${p.confidenceScore * 100}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {p.icpScore ? (
                                <Badge variant="secondary" className="font-mono">
                                  {parseFloat(p.icpScore).toFixed(2)}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell>{getStatusBadge(p.status)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {parseFloat(p.enrichmentCostCredits || "0").toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    Job History
                  </CardTitle>
                  <CardDescription>
                    Recent prospecting missions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {jobs.length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-8">
                        No mission history found.
                      </p>
                    ) : (
                      jobs.map((j) => (
                        <div key={j.id} className="p-3 rounded-lg border bg-card/50 space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="font-medium text-sm truncate max-w-[120px]">{j.query}</div>
                            <Badge variant={j.status === "completed" ? "default" : "secondary"} className="text-[10px] px-1 h-4">
                              {j.status}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{format(new Date(j.createdAt), "MMM d, HH:mm")}</span>
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              {j.processedCount}/{j.limit}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="review">
            <ReviewQueue />
          </TabsContent>

          <TabsContent value="observability">
            <ObservabilityTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
