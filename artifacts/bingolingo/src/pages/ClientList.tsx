import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Globe, Calendar } from "lucide-react";

export default function ClientList() {
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: api.getClients,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your content clients</p>
        </div>
        <Link href="/clients/new">
          <Button className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Client
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">No clients yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first client to start generating content.</p>
            <Link href="/clients/new">
              <Button className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Add Client
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client: any) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{client.name}</p>
                        <Badge variant="outline" className="text-xs mt-1">{client.industry}</Badge>
                      </div>
                    </div>
                  </div>
                  {client.website && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                      <Globe className="h-3 w-3" />
                      <span className="truncate">{client.website}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <Badge variant="secondary">{client.contentCount} content pieces</Badge>
                    {client.lastPublishedAt && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(client.lastPublishedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
