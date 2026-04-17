import { Link } from "wouter";
import {
  useListCrms,
  getListCrmsQueryKey,
  useDeleteCrm,
  getGetCrmQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, Trash2, ArrowRight, FileText } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

export function CrmList() {
  const { data: crms, isLoading } = useListCrms({ query: { queryKey: getListCrmsQueryKey() } });
  const deleteCrm = useDeleteCrm();
  const qc = useQueryClient();
  const { toast } = useToast();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My CRMs</h1>
        <p className="text-muted-foreground mt-1">
          Custom CRMs rebuilt from your liberated data. Each CRM is a standalone record store with its own schema.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : !crms || crms.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-16 text-center flex flex-col items-center">
            <Database className="w-10 h-10 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No CRMs yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Run an extraction job, then click <span className="font-mono text-foreground">Rebuild as CRM</span> on the
              completed job to spin up a custom CRM from the liberated data.
            </p>
            <Link href="/" className="mt-6">
              <Button variant="outline">Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {crms.map((crm) => (
            <Card key={crm.id} className="border-border flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{crm.name}</CardTitle>
                  <Badge variant={crm.status === "committed" ? "default" : "outline"}>
                    {crm.status}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">{crm.description ?? "No description"}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {crm.definition.entities.length} entities
                  </span>
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3" /> {crm.recordCount.toLocaleString()} records
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <Link href={`/crms/${crm.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full gap-2">
                      Open <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this CRM?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the CRM and all {crm.recordCount.toLocaleString()} records inside it.
                          The source extraction job is not affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            deleteCrm.mutate({ id: crm.id }, {
                              onSuccess: () => {
                                toast({ title: "CRM deleted" });
                                qc.invalidateQueries({ queryKey: getListCrmsQueryKey() });
                                qc.invalidateQueries({ queryKey: getGetCrmQueryKey(crm.id) });
                              },
                              onError: () => toast({ title: "Failed to delete CRM", variant: "destructive" }),
                            });
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
