import { AppLayout } from "@/components/layout/AppLayout";
import { useClients, useCreateNewClient } from "@/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Building, Plus, Users, Link2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateClientBodyPlan } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const createSchema = z.object({
  companyName: z.string().min(2, "Required"),
  contactName: z.string().min(2, "Required"),
  contactEmail: z.string().email("Invalid email"),
  plan: z.enum(["single", "team", "enterprise"])
});

type FormData = z.infer<typeof createSchema>;

type PartnerReferral = {
  id: number;
  partnerRef: string;
  clientId: number;
  companyName: string;
  contactName: string;
  contactEmail: string;
  plan: string;
  source: string | null;
  status: string;
  registeredAt: string;
};

const PLAN_COLORS: Record<string, string> = {
  single: "text-cyan border-cyan/30 bg-cyan/10",
  team: "text-primary border-primary/30 bg-primary/10",
  enterprise: "text-gold border-gold/30 bg-gold/10",
};

const PARTNER_LABELS: Record<string, string> = {
  bingolingo: "BingoLingo.ai",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function Clients() {
  const prefersReducedMotion = useReducedMotion();
  const { data: clients, isLoading } = useClients();
  const createClient = useCreateNewClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"clients" | "partners">("clients");

  const { data: referrals = [], isLoading: referralsLoading } = useQuery<PartnerReferral[]>({
    queryKey: ["partner-referrals"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/partner/referrals`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { plan: "single" }
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createClient.mutateAsync({ data });
      setOpen(false);
      reset();
    } catch (e) {
      console.error(e);
    }
  };

  const bingolingoReferrals = referrals.filter(r => r.partnerRef === "bingolingo");

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Building className="text-primary w-8 h-8" />
              Client Database
            </h1>
            <p className="text-muted-foreground font-tech mt-1">Manage active deployments, licenses, and partner referrals.</p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="glow" className="font-tech tracking-wide">
                <Plus className="w-4 h-4 mr-2" /> NEW DEPLOYMENT
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/20">
              <DialogHeader>
                <DialogTitle>Deploy New Environment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Company Name</label>
                  <Input {...register("companyName")} />
                  {errors.companyName && <p className="text-destructive text-xs">{errors.companyName.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Contact Name</label>
                  <Input {...register("contactName")} />
                  {errors.contactName && <p className="text-destructive text-xs">{errors.contactName.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">Contact Email</label>
                  <Input type="email" {...register("contactEmail")} />
                  {errors.contactEmail && <p className="text-destructive text-xs">{errors.contactEmail.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-tech uppercase text-muted-foreground">License Tier</label>
                  <select 
                    {...register("plan")}
                    className="flex h-12 w-full rounded-lg border border-border/50 bg-input/50 px-4 py-2 text-sm font-sans text-foreground"
                  >
                    <option value="single">Single Director</option>
                    <option value="team">Department Team</option>
                    <option value="enterprise">Full Board (Enterprise)</option>
                  </select>
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" variant="glow" disabled={createClient.isPending} className="w-full">
                    {createClient.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "PROVISION ACCESS"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl bg-card border border-border/40 w-fit max-w-full overflow-x-auto">
          {[
            { key: "clients", label: "All Clients", count: clients?.length || 0 },
            { key: "partners", label: "Partner Referrals", count: referrals.length },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all duration-200 min-h-[44px] whitespace-nowrap ${
                tab === t.key
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`text-xs px-2 py-0.5 rounded-full ${tab === t.key ? "bg-primary/20" : "bg-secondary"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Clients Tab */}
        {tab === "clients" && (
          isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : clients?.length === 0 ? (
            <Card className="text-center py-20 border-dashed border-border/50 bg-transparent shadow-none">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">No active deployments found.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients?.map((client) => (
                <Card key={client.id} className="hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-3 border-b border-border/30">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{client.companyName}</CardTitle>
                      <Badge variant={
                        client.status === 'active' ? 'cyan' : 
                        client.status === 'trial' ? 'outline' : 'secondary'
                      }>
                        {client.status.toUpperCase()}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="w-fit text-[10px] mt-1 uppercase text-gold border-gold/30 bg-gold/5">
                      {client.plan} TIER
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-4 flex flex-col gap-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Contact:</span>
                      <span className="text-foreground">{client.contactName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Email:</span>
                      <span className="text-foreground truncate ml-4">{client.contactEmail}</span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <Link href={`/clients/${client.id}`}>
                        <Button variant="outline" size="sm" className="w-full font-tech">Manage Allocation</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}

        {/* Partners Tab */}
        {tab === "partners" && (
          <div className="space-y-8">
            
            {/* BingoLingo Partner Section */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
              className="rounded-2xl border border-gold/20 bg-card overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-border/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
                    <Link2 className="w-6 h-6 text-gold" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg text-gold">BingoLingo.ai</h3>
                    <p className="text-sm text-muted-foreground font-tech">Partner Integration · Active</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center px-4">
                    <div className="text-2xl font-display font-bold text-foreground">{bingolingoReferrals.length}</div>
                    <div className="text-xs text-muted-foreground font-tech">Referred Users</div>
                  </div>
                  <div className="h-10 w-px bg-border/40" />
                  <Link href="/partner/bingolingo">
                    <Button variant="outline" size="sm" className="gap-1.5 font-tech text-xs">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Partner Page
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Partner Link Section */}
              <div className="p-6 border-b border-border/40 bg-gold/5">
                <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">BingoLingo.ai Referral Link</div>
                <div className="flex items-center gap-3">
                  <code className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border/50 text-xs font-mono text-gold truncate">
                    {window.location.origin}/partner/bingolingo
                  </code>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="shrink-0 font-tech text-xs"
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/partner/bingolingo`)}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-tech mt-2">
                  Add this link to BingoLingo.ai. Users who click it land on a co-branded GalaxyBots page and are tracked below.
                </p>
              </div>

              {/* Referrals Table */}
              <div className="p-6">
                {referralsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : bingolingoReferrals.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-tech">No referrals yet. Share the partner link with BingoLingo.ai users.</p>
                  </div>
                ) : (
                  <div className="space-y-3 overflow-x-auto">
                    <div className="min-w-[400px]">
                      <div className="grid grid-cols-4 text-xs font-tech text-muted-foreground uppercase tracking-wider pb-2 border-b border-border/30 px-2">
                        <span>Company</span>
                        <span>Contact</span>
                        <span>Plan</span>
                        <span>Registered</span>
                      </div>
                      {bingolingoReferrals.map((ref) => (
                        <div key={ref.id} className="grid grid-cols-4 text-sm py-3 px-2 rounded-xl hover:bg-secondary/30 transition-colors items-center">
                          <span className="font-medium truncate pr-2">{ref.companyName}</span>
                          <span className="text-muted-foreground truncate pr-4">{ref.contactName}</span>
                          <span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-tech ${PLAN_COLORS[ref.plan] || ""}`}>
                              {ref.plan}
                            </span>
                          </span>
                          <span className="text-muted-foreground text-xs font-tech">{formatDate(ref.registeredAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* All referrals if there are other partners */}
            {referrals.filter(r => r.partnerRef !== "bingolingo").length > 0 && (
              <div className="rounded-2xl border border-border/40 bg-card p-6">
                <h3 className="font-display font-bold mb-4">Other Partner Referrals</h3>
                <div className="space-y-2">
                  {referrals.filter(r => r.partnerRef !== "bingolingo").map((ref) => (
                    <div key={ref.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                      <div>
                        <span className="font-medium text-sm">{ref.companyName}</span>
                        <span className="text-xs text-muted-foreground ml-3 font-tech">via {ref.partnerRef}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-tech">{formatDate(ref.registeredAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
