import { AppLayout } from "@/components/layout/AppLayout";
import { useClients, useCreateNewClient } from "@/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Building, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateClientBodyPlan } from "@workspace/api-client-react";

const createSchema = z.object({
  companyName: z.string().min(2, "Required"),
  contactName: z.string().min(2, "Required"),
  contactEmail: z.string().email("Invalid email"),
  plan: z.enum(["single", "team", "enterprise"])
});

type FormData = z.infer<typeof createSchema>;

export default function Clients() {
  const { data: clients, isLoading } = useClients();
  const createClient = useCreateNewClient();
  const [open, setOpen] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      plan: "single"
    }
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

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Building className="text-primary w-8 h-8" />
              Client Database
            </h1>
            <p className="text-muted-foreground font-tech mt-1">Manage active deployments and licenses.</p>
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

        {isLoading ? (
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
                    <Button variant="outline" size="sm" className="w-full font-tech">Manage Allocation</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
