import { useGetExtractionStats, getGetExtractionStatsQueryKey, useListExtractionJobs, getListExtractionJobsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Activity, CheckCircle2, AlertCircle, Clock, Play, ArrowRight, Pause, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetExtractionStats({ query: { queryKey: getGetExtractionStatsQueryKey() }});
  const { data: jobs, isLoading: jobsLoading } = useListExtractionJobs({ query: { queryKey: getListExtractionJobsQueryKey() }});

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground mt-1">Extraction pipeline overview and recent telemetry.</p>
        </div>
        <Link href="/jobs/new">
          <Button className="gap-2 shadow-sm shadow-primary/20">
            <Play className="w-4 h-4" />
            Initialize Extraction
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.totalJobs || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Successfully</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {statsLoading ? <Skeleton className="h-9 w-20" /> : stats?.completedJobs || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Data Rows Extracted</CardTitle>
            <Database className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {statsLoading ? <Skeleton className="h-9 w-24" /> : (stats?.totalRowsExtracted || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent Telemetry</h2>
          <Link href="/jobs" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <Card className="border-border">
          <div className="divide-y divide-border">
            {jobsLoading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))
            ) : !jobs || jobs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <Database className="w-8 h-8 mb-3 opacity-20" />
                <p>No extraction jobs found.</p>
                <Link href="/jobs/new" className="mt-4">
                  <Button variant="outline">Create your first job</Button>
                </Link>
              </div>
            ) : (
              jobs.slice(0, 10).map((job) => (
                <div key={job.id} className="p-4 hover:bg-secondary/50 transition-colors flex items-center justify-between group">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {job.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-primary" />}
                      {job.status === 'failed' && <AlertCircle className="w-5 h-5 text-destructive" />}
                      {job.status === 'running' && <Activity className="w-5 h-5 text-blue-400 animate-pulse" />}
                      {job.status === 'pending' && <Clock className="w-5 h-5 text-muted-foreground" />}
                      {job.status === 'paused' && <Pause className="w-5 h-5 text-yellow-500" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{job.name}</span>
                        <Badge variant="outline" className="text-[10px] uppercase bg-background">{job.extractionType}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1 max-w-[200px] md:max-w-md truncate">
                          <ExternalLink className="w-3 h-3" />
                          {job.sourceUrl}
                        </span>
                        <span>&bull;</span>
                        <span>{job.rowsExtracted} rows</span>
                        <span>&bull;</span>
                        <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Link href={`/jobs/${job.id}`}>
                    <Button variant="secondary" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      Inspect
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
