import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2, Send, Users, Shield, Copy, Check } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Stakeholder {
  id: number;
  clientId: number;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function StakeholderAccessTab({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: stakeholders, isLoading } = useQuery<Stakeholder[]>({
    queryKey: ["stakeholders", clientId],
    queryFn: () => apiFetch(`/client-portal/stakeholders?clientId=${clientId}`),
  });

  const addMutation = useMutation({
    mutationFn: (data: { clientId: number; name: string; email: string; phone?: string }) =>
      apiFetch("/client-portal/stakeholders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stakeholders", clientId] });
      setShowAdd(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/client-portal/stakeholders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stakeholders", clientId] });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/client-portal/stakeholders/${id}/resend-pin`, { method: "POST" }),
  });

  const portalUrl = `${window.location.origin}${BASE}/client-portal`;

  const copyPortalLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAdd = () => {
    if (!newName || !newEmail) return;
    addMutation.mutate({
      clientId,
      name: newName,
      email: newEmail,
      ...(newPhone ? { phone: newPhone } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-tech text-primary mb-1">Client Portal Access</p>
              <p className="text-sm text-muted-foreground">
                Stakeholders can access a read-only portal to view ROI reports, mission summaries, and approve pending actions.
                Share the portal link below and add stakeholder emails so they can log in via PIN.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Input value={portalUrl} readOnly className="text-xs flex-1" />
                <Button size="sm" variant="outline" onClick={copyPortalLink}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Users className="w-5 h-5" />
              Stakeholders
              {stakeholders && stakeholders.length > 0 && (
                <Badge variant="secondary" className="ml-1">{stakeholders.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Stakeholder
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAdd && (
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20 mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <Input
                  placeholder="Phone (optional)"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newName || !newEmail || addMutation.isPending}
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
              {addMutation.isError && (
                <p className="text-xs text-destructive">{(addMutation.error as Error).message}</p>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !stakeholders || stakeholders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No stakeholders added yet</p>
              <p className="text-xs mt-1">Add stakeholder emails to grant portal access</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stakeholders.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-border/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                    {s.phone && (
                      <p className="text-xs text-muted-foreground">{s.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendMutation.mutate(s.id)}
                      disabled={resendMutation.isPending}
                    >
                      {resendMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Send className="w-3 h-3 mr-1" />
                      )}
                      Send PIN
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeMutation.mutate(s.id)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
