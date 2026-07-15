import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, Upload, X, UserRound, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const ADMIN_ROLES = ["owner", "admin", "csuite"];

function isAdmin(role: string | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

type AvatarPlaceholder = "male" | "female" | "neutral";

interface StaffProfile {
  id: number;
  clientId: number;
  name: string;
  employeeId?: string | null;
  jobTitle: string;
  avatarUrl?: string | null;
  avatarPlaceholder?: AvatarPlaceholder | null;
  selfNote?: string | null;
  adminNote?: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  jobTitle: string;
  employeeId: string;
  selfNote: string;
  adminNote: string;
  avatarPlaceholder: AvatarPlaceholder | "";
  avatarFile: File | null;
  avatarPreview: string | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  jobTitle: "",
  employeeId: "",
  selfNote: "",
  adminNote: "",
  avatarPlaceholder: "neutral",
  avatarFile: null,
  avatarPreview: null,
};

const PLACEHOLDER_OPTIONS: { value: AvatarPlaceholder; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "neutral", label: "Neutral" },
];

function AvatarDisplay({
  profile,
  size = "md",
  clientId,
}: {
  profile: Pick<StaffProfile, "id" | "avatarUrl" | "avatarPlaceholder" | "name">;
  size?: "sm" | "md" | "lg";
  clientId: number;
}) {
  const sizeClass = size === "sm" ? "w-10 h-10" : size === "lg" ? "w-20 h-20" : "w-14 h-14";
  const iconSize = size === "sm" ? 20 : size === "lg" ? 40 : 28;

  if (profile.avatarUrl) {
    return (
      <img
        src={`${API}/clients/${clientId}/staff/${profile.id}/avatar`}
        alt={profile.name}
        className={cn(sizeClass, "rounded-full object-cover ring-2 ring-border")}
      />
    );
  }

  const placeholder = profile.avatarPlaceholder ?? "neutral";
  const bgColor =
    placeholder === "male"
      ? "bg-blue-500/20 text-blue-400"
      : placeholder === "female"
        ? "bg-pink-500/20 text-pink-400"
        : "bg-muted text-muted-foreground";

  return (
    <div className={cn(sizeClass, "rounded-full flex items-center justify-center ring-2 ring-border", bgColor)}>
      <UserRound size={iconSize} />
    </div>
  );
}

export default function StaffDirectory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientId = user?.clientId;
  const canManage = isAdmin(user?.role);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<StaffProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<StaffProfile | null>(null);

  const { data: profiles = [], isLoading } = useQuery<StaffProfile[]>({
    queryKey: ["staff", clientId, search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`${API}/clients/${clientId}/staff${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load staff");
      return res.json();
    },
    enabled: !!clientId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/clients/${clientId}/staff/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", clientId] });
      setDeleteConfirm(null);
      toast({ title: "Staff member removed" });
    },
    onError: () => toast({ title: "Failed to remove staff member", variant: "destructive" }),
  });

  function openAdd() {
    setEditingProfile(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(p: StaffProfile) {
    setEditingProfile(p);
    setForm({
      name: p.name,
      jobTitle: p.jobTitle,
      employeeId: p.employeeId ?? "",
      selfNote: p.selfNote ?? "",
      adminNote: p.adminNote ?? "",
      avatarPlaceholder: p.avatarPlaceholder ?? "neutral",
      avatarFile: null,
      avatarPreview: null,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProfile(null);
    setForm(EMPTY_FORM);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setForm(f => ({ ...f, avatarFile: file, avatarPreview: preview, avatarPlaceholder: "" }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.jobTitle.trim()) {
      toast({ title: "Name and job title are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        jobTitle: form.jobTitle.trim(),
        employeeId: form.employeeId.trim() || null,
        selfNote: form.selfNote.trim() || null,
        adminNote: form.adminNote.trim() || null,
        avatarPlaceholder: form.avatarFile ? null : (form.avatarPlaceholder || "neutral"),
      };

      let profileId = editingProfile?.id;

      if (editingProfile) {
        const res = await fetch(`${API}/clients/${clientId}/staff/${editingProfile.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to update");
      } else {
        const res = await fetch(`${API}/clients/${clientId}/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to create");
        const created: StaffProfile = await res.json();
        profileId = created.id;
      }

      if (form.avatarFile && profileId) {
        const fd = new FormData();
        fd.append("avatar", form.avatarFile);
        const uploadRes = await fetch(`${API}/clients/${clientId}/staff/${profileId}/avatar`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!uploadRes.ok) {
          toast({ title: "Profile saved but avatar upload failed", variant: "destructive" });
        }
      }

      qc.invalidateQueries({ queryKey: ["staff", clientId] });
      toast({ title: editingProfile ? "Profile updated" : "Staff member added" });
      closeModal();
    } catch {
      toast({ title: "Failed to save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="text-primary" size={24} />
              Staff Directory
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your organization's team members
            </p>
          </div>
          {canManage && (
            <Button onClick={openAdd} className="gap-2">
              <Plus size={16} />
              Add Staff Member
            </Button>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-muted-foreground" size={32} />
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Users size={48} className="text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {search ? "No staff members match your search." : "No staff members yet."}
            </p>
            {canManage && !search && (
              <Button variant="outline" onClick={openAdd} className="gap-2 mt-2">
                <Plus size={16} />
                Add First Member
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {profiles.map(p => (
              <Card key={p.id} className="group hover:border-primary/40 transition-colors">
                <CardContent className="pt-5 pb-4 px-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AvatarDisplay profile={p} clientId={clientId!} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{p.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{p.jobTitle}</p>
                      {canManage && p.employeeId && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          ID: {p.employeeId}
                        </Badge>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(p)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>

                  {p.selfNote && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{p.selfNote}</p>
                  )}

                  {canManage && p.adminNote && (
                    <div className="border-t pt-2 mt-2">
                      <div className="flex items-center gap-1 text-xs text-amber-500 mb-1">
                        <Shield size={11} />
                        Admin note
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.adminNote}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={modalOpen} onOpenChange={open => { if (!open) closeModal(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProfile ? "Edit Staff Profile" : "Add Staff Member"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  {form.avatarPreview ? (
                    <img
                      src={form.avatarPreview}
                      alt="Preview"
                      className="w-20 h-20 rounded-full object-cover ring-2 ring-border"
                    />
                  ) : editingProfile?.avatarUrl ? (
                    <img
                      src={`${API}/clients/${clientId}/staff/${editingProfile.id}/avatar`}
                      alt="Current"
                      className="w-20 h-20 rounded-full object-cover ring-2 ring-border"
                    />
                  ) : (
                    <div className={cn(
                      "w-20 h-20 rounded-full flex items-center justify-center ring-2 ring-border",
                      form.avatarPlaceholder === "male"
                        ? "bg-blue-500/20 text-blue-400"
                        : form.avatarPlaceholder === "female"
                          ? "bg-pink-500/20 text-pink-400"
                          : "bg-muted text-muted-foreground",
                    )}>
                      <UserRound size={36} />
                    </div>
                  )}
                  {form.avatarPreview && (
                    <button
                      className="absolute -top-1 -right-1 bg-background border rounded-full p-0.5"
                      onClick={() => setForm(f => ({ ...f, avatarFile: null, avatarPreview: null, avatarPlaceholder: "neutral" }))}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex gap-2 items-center flex-wrap justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    Upload photo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <span className="text-xs text-muted-foreground">or choose avatar:</span>
                  <div className="flex gap-1">
                    {PLACEHOLDER_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, avatarPlaceholder: opt.value, avatarFile: null, avatarPreview: null }))}
                        className={cn(
                          "px-2 py-0.5 rounded text-xs border transition-colors",
                          form.avatarPlaceholder === opt.value && !form.avatarFile
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="staff-name">Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="staff-name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="staff-title">Job Title <span className="text-destructive">*</span></Label>
                  <Input
                    id="staff-title"
                    value={form.jobTitle}
                    onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                    placeholder="e.g. Senior Engineer"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="staff-emp-id" className="flex items-center gap-1">
                    Employee ID
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Admin only</Badge>
                  </Label>
                  <Input
                    id="staff-emp-id"
                    value={form.employeeId}
                    onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="staff-self-note">About Me</Label>
                <Textarea
                  id="staff-self-note"
                  value={form.selfNote}
                  onChange={e => setForm(f => ({ ...f, selfNote: e.target.value }))}
                  placeholder="Visible to everyone in the org…"
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="staff-admin-note" className="flex items-center gap-1.5">
                  <Shield size={13} className="text-amber-500" />
                  Admin Note
                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-500/40">
                    Private — admins only
                  </Badge>
                </Label>
                <Textarea
                  id="staff-admin-note"
                  value={form.adminNote}
                  onChange={e => setForm(f => ({ ...f, adminNote: e.target.value }))}
                  placeholder="Internal notes — not visible to the employee…"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingProfile ? "Save Changes" : "Add Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove staff member?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>{deleteConfirm?.name}</strong>'s profile. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
