import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen,
  Globe,
  FileText,
  Database,
  RefreshCw,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

interface KnowledgeBaseSource {
  id: number;
  clientId: number;
  sourceType: string;
  name: string;
  config: Record<string, unknown>;
  syncSchedule: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

const SOURCE_TYPES = [
  {
    key: "google_drive",
    name: "Google Drive",
    description: "Sync documents from a Google Drive folder",
    icon: FolderOpen,
    fields: [
      { key: "folderId", label: "Folder ID", placeholder: "e.g. 1abc2def3ghi...", type: "text" },
      { key: "accessToken", label: "OAuth Access Token", placeholder: "Paste your Google OAuth token...", type: "password" },
    ],
  },
  {
    key: "confluence",
    name: "Confluence",
    description: "Sync pages from a Confluence space",
    icon: FileText,
    fields: [
      { key: "baseUrl", label: "Confluence Base URL", placeholder: "https://yourcompany.atlassian.net/wiki", type: "text" },
      { key: "spaceKey", label: "Space Key", placeholder: "e.g. ENG, DOCS", type: "text" },
      { key: "email", label: "Email", placeholder: "your-email@company.com", type: "text" },
      { key: "apiToken", label: "API Token", placeholder: "Paste your Confluence API token...", type: "password" },
    ],
  },
  {
    key: "sharepoint",
    name: "SharePoint",
    description: "Sync files from a SharePoint document library",
    icon: Database,
    fields: [
      { key: "siteId", label: "Site ID", placeholder: "SharePoint site ID", type: "text" },
      { key: "driveId", label: "Drive ID", placeholder: "Document library drive ID", type: "text" },
      { key: "accessToken", label: "OAuth Access Token", placeholder: "Paste your Microsoft OAuth token...", type: "password" },
    ],
  },
  {
    key: "website",
    name: "Website",
    description: "Crawl and index pages from a website",
    icon: Globe,
    fields: [
      { key: "rootUrl", label: "Root URL", placeholder: "https://yourcompany.com", type: "text" },
      { key: "maxDepth", label: "Crawl Depth", placeholder: "2", type: "number" },
      { key: "maxPages", label: "Max Pages", placeholder: "50", type: "number" },
    ],
  },
];

function getStatusBadge(status: string, lastSyncStatus: string | null) {
  switch (status) {
    case "syncing":
      return (
        <Badge variant="secondary" className="gap-1 bg-blue-600 text-white">
          <Loader2 className="h-3 w-3 animate-spin" /> Syncing
        </Badge>
      );
    case "active":
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" /> Active
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> Error
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" /> {status}
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString();
}

function AddSourceDialog({ clientId, onClose }: { clientId: number; onClose: () => void }) {
  const [sourceType, setSourceType] = useState("");
  const [name, setName] = useState("");
  const [syncSchedule, setSyncSchedule] = useState("daily");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const selectedType = SOURCE_TYPES.find(t => t.key === sourceType);

  const createMutation = useMutation({
    mutationFn: async () => {
      const config: Record<string, unknown> = { ...configValues };
      if (sourceType === "website") {
        if (config.maxDepth) config.maxDepth = Number(config.maxDepth);
        if (config.maxPages) config.maxPages = Number(config.maxPages);
      }

      const res = await fetch(`${API_BASE}/knowledge-base/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceType, name, config, syncSchedule }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create source");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-sources", clientId] });
      toast({ title: "Source added", description: `${name} has been added as a knowledge source.` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isValid = sourceType && name.trim() && selectedType?.fields.every(f => {
    if (f.key === "maxDepth" || f.key === "maxPages") return true;
    return configValues[f.key]?.trim();
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Source Type</label>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_TYPES.map(type => {
            const Icon = type.icon;
            return (
              <button
                key={type.key}
                onClick={() => { setSourceType(type.key); setConfigValues({}); }}
                className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent ${
                  sourceType === type.key ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">{type.name}</div>
                  <div className="text-xs text-muted-foreground">{type.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedType && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium">Source Name</label>
            <Input
              placeholder="e.g. Engineering Docs, Company Wiki"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {selectedType.fields.map(field => (
            <div key={field.key} className="space-y-2">
              <label className="text-sm font-medium">{field.label}</label>
              <Input
                type={field.type === "password" ? "password" : "text"}
                placeholder={field.placeholder}
                value={configValues[field.key] || ""}
                onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="space-y-2">
            <label className="text-sm font-medium">Sync Schedule</label>
            <Select value={syncSchedule} onValueChange={setSyncSchedule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Source
          </Button>
        </>
      )}
    </div>
  );
}

function SourceCard({ source, clientId }: { source: KnowledgeBaseSource; clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const typeInfo = SOURCE_TYPES.find(t => t.key === source.sourceType);
  const Icon = typeInfo?.icon || Database;

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/knowledge-base/sources/${clientId}/${source.id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start sync");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-sources", clientId] });
      toast({ title: "Sync started", description: `Syncing ${source.name}...` });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/knowledge-base/sources/${clientId}/${source.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete source");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-sources", clientId] });
      toast({ title: "Source removed", description: `${source.name} has been disconnected.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove source.", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg">{source.name}</CardTitle>
            {getStatusBadge(source.status, source.lastSyncStatus)}
          </div>
          <CardDescription className="mt-1">
            {typeInfo?.name || source.sourceType} · {source.documentCount} document{source.documentCount !== 1 ? "s" : ""} · Syncs {source.syncSchedule}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Last synced</span>
            <div className="font-medium">{formatDate(source.lastSyncAt)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Added</span>
            <div className="font-medium">{formatDate(source.createdAt)}</div>
          </div>
        </div>

        {source.lastSyncError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {source.lastSyncError}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || source.status === "syncing"}
            className="gap-1.5"
          >
            {syncMutation.isPending || source.status === "syncing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Are you sure you want to remove this source? All indexed content will be deleted.")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function KnowledgeBase() {
  const [clientId, setClientId] = useState<number>(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: clients } = useQuery<Array<{ id: number; companyName: string }>>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/clients`, { credentials: "include" });
      return res.json();
    },
  });

  useEffect(() => {
    if (clients && clients.length > 0 && !clients.find(c => c.id === clientId)) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  const { data: sources = [], isLoading } = useQuery<KnowledgeBaseSource[]>({
    queryKey: ["kb-sources", clientId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/knowledge-base/sources/${clientId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!clientId,
    refetchInterval: 15000,
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Knowledge Base</h1>
            <p className="text-muted-foreground mt-1">
              Connect external sources so your bots always have up-to-date company knowledge. Content is automatically fetched, chunked, and indexed.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Knowledge Source</DialogTitle>
                <DialogDescription>
                  Connect a Google Drive folder, Confluence space, SharePoint library, or website to automatically sync content.
                </DialogDescription>
              </DialogHeader>
              <AddSourceDialog clientId={clientId} onClose={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {clients && clients.length > 1 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Client:</label>
            <select
              className="rounded border px-3 py-1.5 text-sm bg-background"
              value={clientId}
              onChange={e => setClientId(Number(e.target.value))}
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sources.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No knowledge sources connected</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Connect a Google Drive folder, Confluence space, SharePoint library, or website to automatically sync content into your knowledge base.
              </p>
              <Button className="mt-4 gap-2" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Your First Source
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sources.map(source => (
              <SourceCard key={source.id} source={source} clientId={clientId} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
