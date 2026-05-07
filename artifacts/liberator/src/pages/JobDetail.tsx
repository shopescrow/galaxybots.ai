import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { 
  useGetExtractionJob, 
  getGetExtractionJobQueryKey,
  useDeleteExtractionJob,
  useRunExtractionJob,
  usePreviewExtractionData,
  getPreviewExtractionDataQueryKey,
  getListExtractionJobsQueryKey,
  getGetExtractionStatsQueryKey,
  useRebuildJobAsCrm,
  getListCrmsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, Play, Pause, Trash2, Download, AlertCircle, CheckCircle2, 
  Clock, Database, LayoutList, Server, Bot, Contact2, ExternalLink, RefreshCw, Wand2
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function JobDetail() {
  const { id } = useParams();
  const jobId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobDetail, isLoading, refetch } = useGetExtractionJob(jobId, { 
    query: { 
      enabled: !!jobId, 
      queryKey: getGetExtractionJobQueryKey(jobId),
      refetchInterval: (query) => {
        const status = query.state?.data?.job?.status;
        return status === 'running' || status === 'pending' ? 3000 : false;
      }
    } 
  });

  const { data: previewData, isLoading: previewLoading } = usePreviewExtractionData(jobId, {
    query: {
      enabled: !!jobId && !!jobDetail?.job && jobDetail.job.rowsExtracted > 0,
      queryKey: getPreviewExtractionDataQueryKey(jobId)
    }
  });

  const deleteJob = useDeleteExtractionJob();
  const runJob = useRunExtractionJob();
  const rebuild = useRebuildJobAsCrm();

  if (!jobId) {
    return <div>Invalid Job ID</div>;
  }

  const handleDelete = () => {
    deleteJob.mutate(
      { id: jobId },
      {
        onSuccess: () => {
          toast({ title: "Job deleted" });
          queryClient.invalidateQueries({ queryKey: getListExtractionJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetExtractionStatsQueryKey() });
          setLocation("/");
        },
        onError: () => {
          toast({ title: "Failed to delete job", variant: "destructive" });
        }
      }
    );
  };

  const handleRun = () => {
    runJob.mutate(
      { id: jobId },
      {
        onSuccess: () => {
          toast({ title: "Job started", description: "Extraction pipeline is running." });
          refetch();
        },
        onError: () => {
          toast({ title: "Failed to start job", variant: "destructive" });
        }
      }
    );
  };

  const handleDownload = (format: 'csv' | 'json') => {
    const downloadUrl = `${window.location.origin}/api/v1/liberator/jobs/${jobId}/download?format=${format}`;
    window.open(downloadUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (!jobDetail || !jobDetail.job) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold">Job Not Found</h2>
        <p className="text-muted-foreground mt-2">The extraction job you are looking for does not exist.</p>
        <Link href="/">
          <Button className="mt-6">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const { job, pages, fieldMapping } = jobDetail;
  
  const progressPercent = job.totalPages > 0 
    ? Math.round((job.pagesCompleted / job.totalPages) * 100) 
    : (job.status === 'completed' ? 100 : 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-primary" />;
      case 'failed': return <AlertCircle className="w-5 h-5 text-destructive" />;
      case 'running': return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'pending': return <Clock className="w-5 h-5 text-muted-foreground" />;
      case 'paused': return <Pause className="w-5 h-5 text-yellow-500" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getExtractionTypeIcon = (type: string) => {
    switch (type) {
      case 'table': return <Server className="w-4 h-4 text-muted-foreground" />;
      case 'list': return <LayoutList className="w-4 h-4 text-muted-foreground" />;
      case 'contacts': return <Contact2 className="w-4 h-4 text-muted-foreground" />;
      case 'custom': return <Bot className="w-4 h-4 text-muted-foreground" />;
      default: return <Database className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{job.name}</h1>
            <Badge variant="outline" className="uppercase text-[10px] bg-background flex items-center gap-1">
              {getExtractionTypeIcon(job.extractionType)}
              {job.extractionType}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> {job.sourceUrl}
            </a>
            <span>&bull;</span>
            <span>Created {new Date(job.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {job.status === 'completed' && job.rowsExtracted > 0 && (
            <Button
              onClick={() => {
                rebuild.mutate({ id: jobId }, {
                  onSuccess: (crm) => {
                    toast({ title: "CRM blueprint inferred", description: "Review the schema, then commit." });
                    queryClient.invalidateQueries({ queryKey: getListCrmsQueryKey() });
                    setLocation(`/crms/${crm.id}`);
                  },
                  onError: () => toast({ title: "Rebuild failed", variant: "destructive" }),
                });
              }}
              disabled={rebuild.isPending}
              className="gap-2"
            >
              <Wand2 className="w-4 h-4" />
              {rebuild.isPending ? "Inferring…" : "Rebuild as CRM"}
            </Button>
          )}

          {(job.status === 'pending' || job.status === 'failed' || job.status === 'paused' || job.status === 'completed') && (
            <Button variant="secondary" onClick={handleRun} disabled={runJob.isPending} className="gap-2">
              {job.status === 'completed' ? <RefreshCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {job.status === 'completed' ? 'Re-run' : 'Start'}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={job.rowsExtracted === 0}>
                <Download className="w-4 h-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => handleDownload('csv')}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload('json')}>
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the extraction job and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {job.errorMessage && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-destructive">Extraction Error</h4>
            <p className="text-sm text-destructive/80 mt-1">{job.errorMessage}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border lg:col-span-1">
          <CardHeader>
            <CardTitle>Status Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-3">
              {getStatusIcon(job.status)}
              <div className="flex-1">
                <div className="font-semibold capitalize">{job.status}</div>
                <div className="text-sm text-muted-foreground">{job.pagesCompleted} of {job.totalPages || '?'} pages processed</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Rows Extracted</div>
                <div className="text-2xl font-bold text-primary">{job.rowsExtracted.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Pages Found</div>
                <div className="text-2xl font-bold">{job.totalPages.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
            <CardDescription>First 10 rows extracted from the source.</CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !previewData || previewData.rows.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-border rounded-md">
                <Database className="w-8 h-8 text-muted-foreground opacity-50 mx-auto mb-3" />
                <p className="text-muted-foreground">No data extracted yet.</p>
                {job.status === 'pending' && <p className="text-sm text-muted-foreground mt-1">Start the job to begin extraction.</p>}
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      {previewData.columns.map((col, i) => (
                        <TableHead key={i} className="font-mono text-xs text-foreground whitespace-nowrap">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.rows.slice(0, 10).map((row: any, i) => (
                      <TableRow key={i}>
                        {previewData.columns.map((col, j) => (
                          <TableCell key={j} className="text-sm max-w-[200px] truncate" title={String(row[col])}>
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-muted-foreground italic">null</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {previewData && previewData.totalRows > 10 && (
              <div className="text-xs text-center text-muted-foreground mt-4">
                Showing 10 of {previewData.totalRows} rows. Export to see all data.
              </div>
            )}
          </CardContent>
        </Card>

        {pages && pages.length > 0 && (
          <Card className="border-border lg:col-span-3">
            <CardHeader>
              <CardTitle>Page Process Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      <TableHead>Page #</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pages.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="font-medium text-muted-foreground">{page.pageNumber}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">
                          <a href={page.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            {page.pageUrl}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={
                              page.status === 'extracted' ? 'bg-primary/10 text-primary border-primary/20' : 
                              page.status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20' : 
                              ''
                            }
                          >
                            {page.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{page.extractedRows?.length || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
