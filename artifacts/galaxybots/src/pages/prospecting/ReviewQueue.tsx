import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, XCircle, Edit3, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Prospect {
  id: number;
  companyName: string;
  domain: string;
  phone: string | null;
  email: string | null;
  confidenceScore: number;
  status: string;
  createdAt: string;
}

export function ReviewQueue() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [corrections, setCorrections] = useState<Partial<Prospect>>({});
  const { toast } = useToast();

  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/prospects/review-queue");
      if (res.ok) {
        const data = await res.json();
        setProspects(data);
      }
    } catch (err) {
      console.error("Failed to fetch queue", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleReview = async (id: number, action: "approve" | "reject" | "correct") => {
    setReviewingId(id);
    try {
      const res = await fetch(`/api/prospecting/prospects/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, corrections: action === "correct" ? corrections : undefined }),
      });

      if (res.ok) {
        toast({ title: "Success", description: `Prospect ${action}ed successfully.` });
        setProspects(prospects.filter(p => p.id !== id));
        setCorrections({});
      } else {
        throw new Error("Failed to process review");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to process review.", variant: "destructive" });
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {prospects.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 h-4" />
          <AlertTitle>Review Required</AlertTitle>
          <AlertDescription>
            There are {prospects.length} prospects in the review queue. High-confidence automation is paused for these records.
          </AlertDescription>
        </Alert>
      )}

      {prospects.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Review queue is empty. High-confidence data is flowing normally.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {prospects.map((prospect) => (
            <Card key={prospect.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{prospect.companyName || prospect.domain}</CardTitle>
                    <CardDescription>{prospect.domain}</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant={prospect.confidenceScore >= 0.7 ? "default" : "destructive"}>
                      {(prospect.confidenceScore * 100).toFixed(0)}% Confidence
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      SLA: 24h
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p>{prospect.email || "Not found"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p>{prospect.phone || "Not found"}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Data Integrity</span>
                      <span>{(prospect.confidenceScore * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={prospect.confidenceScore * 100} className="h-1" />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleReview(prospect.id, "reject")}
                      disabled={reviewingId === prospect.id}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Edit3 className="w-4 h-4 mr-2" />
                          Correct
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Correct Prospect Data</DialogTitle>
                          <DialogDescription>Manually verify and update details for {prospect.domain}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label>Company Name</Label>
                            <Input 
                              defaultValue={prospect.companyName} 
                              onChange={e => setCorrections({...corrections, companyName: e.target.value})}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Email</Label>
                            <Input 
                              defaultValue={prospect.email || ""} 
                              onChange={e => setCorrections({...corrections, email: e.target.value})}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Phone</Label>
                            <Input 
                              defaultValue={prospect.phone || ""} 
                              onChange={e => setCorrections({...corrections, phone: e.target.value})}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={() => handleReview(prospect.id, "correct")} disabled={reviewingId === prospect.id}>
                            Save & Approve
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Button 
                      size="sm"
                      onClick={() => handleReview(prospect.id, "approve")}
                      disabled={reviewingId === prospect.id}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
