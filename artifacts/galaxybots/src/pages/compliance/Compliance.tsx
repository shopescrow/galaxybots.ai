import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  usePlatformCompliance,
  usePlatformComplianceConfig,
  useClientCompliance,
  useCreateClientComplianceMutation,
  useUpdateClientComplianceMutation,
  useDeleteClientComplianceMutation,
} from "@/hooks/use-compliance";
import { useClients } from "@/hooks/use-clients";
import type {
  CreateClientComplianceBodyStatus,
  UpdateClientComplianceBodyStatus,
} from "@workspace/api-client-react";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Plus,
  Trash2,
  Pencil,
  Copy,
  CheckCircle2,
  Clock,
  MinusCircle,
  Building,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

type ClientComplianceStatus = CreateClientComplianceBodyStatus | UpdateClientComplianceBodyStatus;

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  compliant: { icon: CheckCircle2, color: "text-emerald-400", label: "Compliant" },
  non_compliant: { icon: ShieldX, color: "text-destructive", label: "Non-Compliant" },
  pending: { icon: Clock, color: "text-yellow-400", label: "Pending" },
  expired: { icon: ShieldAlert, color: "text-orange-400", label: "Expired" },
  met: { icon: CheckCircle2, color: "text-emerald-400", label: "Met" },
  not_applicable: { icon: MinusCircle, color: "text-muted-foreground", label: "N/A" },
};

const CLIENT_STATUS_VALUES: ClientComplianceStatus[] = ["met", "pending", "not_applicable"];
const CLIENT_STATUS_LABELS: Record<ClientComplianceStatus, string> = {
  met: "Met",
  pending: "Pending",
  not_applicable: "Not Applicable",
};

const CATEGORIES = ["security", "privacy", "regulatory", "industry", "custom"];

function isValidClientStatus(value: string): value is ClientComplianceStatus {
  return CLIENT_STATUS_VALUES.includes(value as ClientComplianceStatus);
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} border-current/30 gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

interface RequirementFormData {
  name: string;
  category: string;
  status: ClientComplianceStatus;
  notes: string;
}

const EMPTY_FORM: RequirementFormData = { name: "", category: "", status: "pending", notes: "" };

function RequirementFormFields({
  formData,
  onChange,
}: {
  formData: RequirementFormData;
  onChange: (update: Partial<RequirementFormData>) => void;
}) {
  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-2">
        <label className="text-xs font-tech uppercase text-muted-foreground">Standard Name</label>
        <Input
          placeholder="e.g. SOC 2, HIPAA, GDPR"
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-tech uppercase text-muted-foreground">Category</label>
        <select
          value={formData.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="flex h-12 w-full rounded-lg border border-border/50 bg-input/50 px-4 py-2 text-sm font-sans text-foreground"
        >
          <option value="">Select category...</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-tech uppercase text-muted-foreground">Status</label>
        <select
          value={formData.status}
          onChange={(e) => {
            const val = e.target.value;
            if (isValidClientStatus(val)) onChange({ status: val });
          }}
          className="flex h-12 w-full rounded-lg border border-border/50 bg-input/50 px-4 py-2 text-sm font-sans text-foreground"
        >
          {CLIENT_STATUS_VALUES.map(s => (
            <option key={s} value={s}>{CLIENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-tech uppercase text-muted-foreground">Notes (Optional)</label>
        <Input
          placeholder="Additional details..."
          value={formData.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function PlatformCompliancePanel() {
  const { data: records, isLoading } = usePlatformCompliance();
  const { data: config } = usePlatformComplianceConfig();
  const [showConfig, setShowConfig] = useState(false);

  const compliantCount = records?.filter(r => r.status === "compliant").length ?? 0;
  const totalCount = records?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Platform Compliance Status
          </h2>
          <p className="text-sm text-muted-foreground font-tech mt-1">
            Compliance data received from external compliance applications
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-tech text-xs"
          onClick={() => setShowConfig(!showConfig)}
        >
          {showConfig ? "Hide" : "Show"} API Config
        </Button>
      </div>

      {showConfig && config && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="text-xs font-tech uppercase text-muted-foreground tracking-wider">Inbound Webhook Configuration</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground font-tech text-xs">Endpoint URL</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono truncate">
                    {config.endpointUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => navigator.clipboard.writeText(config.endpointUrl ?? "")}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground font-tech text-xs">Method</span>
                <div className="mt-1">
                  <code className="px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono">
                    {config.method}
                  </code>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground font-tech text-xs">API Key Header</span>
                <div className="mt-1">
                  <code className="px-3 py-1.5 rounded bg-background border border-border/50 text-xs font-mono">
                    {config.apiKeyHeader}
                  </code>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground font-tech text-xs">API Key Status</span>
                <div className="mt-1">
                  <Badge variant={config.apiKeyConfigured ? "cyan" : "outline"} className="text-xs">
                    {config.apiKeyConfigured ? "Configured" : "Not Configured"}
                  </Badge>
                  {!config.apiKeyConfigured && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Set the COMPLIANCE_API_KEY environment variable to enable the inbound webhook.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground font-tech text-xs">Example Payload</span>
              <pre className="mt-1 px-3 py-2 rounded bg-background border border-border/50 text-xs font-mono overflow-x-auto">
                {JSON.stringify(config.payloadExample, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {totalCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-display font-bold text-emerald-400">{compliantCount}</div>
              <div className="text-xs font-tech text-muted-foreground">Compliant</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-display font-bold text-yellow-400">
                {records?.filter(r => r.status === "pending").length ?? 0}
              </div>
              <div className="text-xs font-tech text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-display font-bold text-destructive">
                {records?.filter(r => r.status === "non_compliant").length ?? 0}
              </div>
              <div className="text-xs font-tech text-muted-foreground">Non-Compliant</div>
            </CardContent>
          </Card>
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-display font-bold text-orange-400">
                {records?.filter(r => r.status === "expired").length ?? 0}
              </div>
              <div className="text-xs font-tech text-muted-foreground">Expired</div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !records || records.length === 0 ? (
        <Card className="border-dashed border-border/50 bg-transparent shadow-none">
          <CardContent className="p-12 text-center">
            <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-tech font-bold mb-2">No Compliance Data Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Configure your external compliance application to push data to the webhook endpoint above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <Card key={record.id} className="border-border/40 hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="font-tech font-bold">{record.standardName}</h4>
                      <StatusBadge status={record.status} />
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {record.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground font-tech flex-wrap">
                      {record.issuedBy && <span>Issued by: {record.issuedBy}</span>}
                      {record.certificationId && <span>Cert: {record.certificationId}</span>}
                      <span>Received: {format(new Date(record.receivedAt), "MMM d, yyyy")}</span>
                      {record.expiresAt && (
                        <span className={new Date(record.expiresAt) < new Date() ? "text-destructive" : ""}>
                          Expires: {format(new Date(record.expiresAt), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                    {record.details && (
                      <p className="text-sm text-muted-foreground mt-2">{record.details}</p>
                    )}
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

function ClientComplianceSection() {
  const { data: clients, isLoading: clientsLoading } = useClients();
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<RequirementFormData>({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);

  const clientId = selectedClientId ?? (clients?.[0]?.id ?? 0);
  const { data: requirements, isLoading: reqLoading } = useClientCompliance(clientId);
  const createMutation = useCreateClientComplianceMutation(clientId);
  const updateMutation = useUpdateClientComplianceMutation(clientId);
  const deleteMutation = useDeleteClientComplianceMutation(clientId);

  const updateForm = (update: Partial<RequirementFormData>) => {
    setFormData(prev => ({ ...prev, ...update }));
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.category) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        clientId,
        data: {
          name: formData.name,
          category: formData.category,
          status: formData.status,
          notes: formData.notes || undefined,
        },
      });
      setFormData({ ...EMPTY_FORM });
      setAddOpen(false);
    } catch {
      setError("Failed to add requirement. Please try again.");
    }
  };

  const openEdit = (req: { id: number; name: string; category: string; status: string; notes?: string | null }) => {
    setEditingId(req.id);
    setFormData({
      name: req.name,
      category: req.category,
      status: isValidClientStatus(req.status) ? req.status : "pending",
      notes: req.notes ?? "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingId || !formData.name || !formData.category) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        clientId,
        id: editingId,
        data: {
          name: formData.name,
          category: formData.category,
          status: formData.status,
          notes: formData.notes || undefined,
        },
      });
      setFormData({ ...EMPTY_FORM });
      setEditingId(null);
      setEditOpen(false);
    } catch {
      setError("Failed to update requirement. Please try again.");
    }
  };

  const handleStatusToggle = async (reqId: number, currentStatus: string) => {
    const nextStatus: ClientComplianceStatus = currentStatus === "met" ? "pending" : "met";
    setError(null);
    try {
      await updateMutation.mutateAsync({
        clientId,
        id: reqId,
        data: { status: nextStatus },
      });
    } catch {
      setError("Failed to update status. Please try again.");
    }
  };

  const handleDelete = async (reqId: number) => {
    setError(null);
    try {
      await deleteMutation.mutateAsync({ clientId, id: reqId });
    } catch {
      setError("Failed to delete requirement. Please try again.");
    }
  };

  const metCount = requirements?.filter(r => r.status === "met").length ?? 0;
  const pendingCount = requirements?.filter(r => r.status === "pending").length ?? 0;
  const totalCount = requirements?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <Building className="w-5 h-5 text-primary" />
            Client Compliance Requirements
          </h2>
          <p className="text-sm text-muted-foreground font-tech mt-1">
            Define and track compliance standards each client requires
          </p>
        </div>
      </div>

      {clientsLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !clients || clients.length === 0 ? (
        <Card className="border-dashed border-border/50 bg-transparent shadow-none">
          <CardContent className="p-12 text-center">
            <Building className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-tech font-bold mb-2">No Clients Yet</h3>
            <p className="text-sm text-muted-foreground">Add clients first to manage their compliance requirements.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative">
              <select
                value={clientId}
                onChange={(e) => setSelectedClientId(Number(e.target.value))}
                className="appearance-none flex h-12 rounded-lg border border-border/50 bg-input/50 px-4 pr-10 py-2 text-sm font-tech text-foreground min-w-[240px]"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.companyName}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setFormData({ ...EMPTY_FORM }); }}>
              <DialogTrigger asChild>
                <Button variant="glow" size="sm" className="font-tech tracking-wide">
                  <Plus className="w-4 h-4 mr-2" /> Add Requirement
                </Button>
              </DialogTrigger>
              <DialogContent className="border-primary/20">
                <DialogHeader>
                  <DialogTitle className="font-display">Add Compliance Requirement</DialogTitle>
                </DialogHeader>
                <RequirementFormFields formData={formData} onChange={updateForm} />
                <DialogFooter className="pt-4">
                  <Button
                    variant="glow"
                    onClick={handleAdd}
                    disabled={!formData.name || !formData.category || createMutation.isPending}
                    className="w-full"
                  >
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Requirement"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setFormData({ ...EMPTY_FORM }); setEditingId(null); } }}>
              <DialogContent className="border-primary/20">
                <DialogHeader>
                  <DialogTitle className="font-display">Edit Compliance Requirement</DialogTitle>
                </DialogHeader>
                <RequirementFormFields formData={formData} onChange={updateForm} />
                <DialogFooter className="pt-4">
                  <Button
                    variant="glow"
                    onClick={handleEdit}
                    disabled={!formData.name || !formData.category || updateMutation.isPending}
                    className="w-full"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-tech">
              {error}
            </div>
          )}

          {totalCount > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-display font-bold text-emerald-400">{metCount}</div>
                  <div className="text-xs font-tech text-muted-foreground">Met</div>
                </CardContent>
              </Card>
              <Card className="border-yellow-500/20 bg-yellow-500/5">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-display font-bold text-yellow-400">{pendingCount}</div>
                  <div className="text-xs font-tech text-muted-foreground">Pending</div>
                </CardContent>
              </Card>
              <Card className="border-border/20">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-display font-bold text-muted-foreground">
                    {totalCount - metCount - pendingCount}
                  </div>
                  <div className="text-xs font-tech text-muted-foreground">N/A</div>
                </CardContent>
              </Card>
            </div>
          )}

          {reqLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !requirements || requirements.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-transparent shadow-none">
              <CardContent className="p-12 text-center">
                <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-tech font-bold mb-2">No Requirements Defined</h3>
                <p className="text-sm text-muted-foreground">
                  Add compliance requirements this client needs to meet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requirements.map((req) => (
                <Card key={req.id} className="border-border/40 hover:border-primary/30 transition-colors group">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h4 className="font-tech font-bold">{req.name}</h4>
                          <StatusBadge status={req.status} />
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {req.category}
                          </Badge>
                        </div>
                        {req.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{req.notes}</p>
                        )}
                        <div className="text-xs text-muted-foreground font-tech mt-2">
                          Updated: {format(new Date(req.updatedAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs font-tech h-8"
                          onClick={() => handleStatusToggle(req.id, req.status)}
                          disabled={updateMutation.isPending}
                        >
                          {req.status === "met" ? "Mark Pending" : "Mark Met"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => openEdit(req)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(req.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Compliance() {
  const [tab, setTab] = useState<"platform" | "client">("platform");

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
            <ShieldCheck className="text-primary w-7 h-7 sm:w-8 sm:h-8" />
            Compliance Center
          </h1>
          <p className="text-muted-foreground font-tech mt-1">
            Platform compliance status and client compliance requirements management.
          </p>
        </div>

        <div className="flex gap-1 mb-8 p-1 rounded-xl bg-card border border-border/40 w-fit max-w-full overflow-x-auto">
          {[
            { key: "platform" as const, label: "Platform Status" },
            { key: "client" as const, label: "Client Requirements" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-tech transition-all duration-200 min-h-[44px] whitespace-nowrap ${
                tab === t.key
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "platform" && <PlatformCompliancePanel />}
        {tab === "client" && <ClientComplianceSection />}
      </div>
    </AppLayout>
  );
}
