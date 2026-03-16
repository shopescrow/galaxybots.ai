import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUserPreferences, ACCENT_COLOR_MAP } from "@/contexts/UserPreferencesContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, LANGUAGES } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Check, Palette, Type, LayoutDashboard, Loader2, Image, Globe, Store, Bot, Zap, GitBranch, Trash2, ExternalLink, Pencil, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

const ACCENT_OPTIONS = [
  { key: "purple", label: "Purple", preview: "bg-[hsl(270,80%,60%)]" },
  { key: "cyan", label: "Cyan", preview: "bg-[hsl(190,90%,50%)]" },
  { key: "gold", label: "Gold", preview: "bg-[hsl(45,100%,55%)]" },
  { key: "green", label: "Green", preview: "bg-[hsl(142,76%,45%)]" },
  { key: "orange", label: "Orange", preview: "bg-[hsl(25,95%,55%)]" },
  { key: "red", label: "Red", preview: "bg-[hsl(0,84%,60%)]" },
  { key: "blue", label: "Blue", preview: "bg-[hsl(217,91%,60%)]" },
  { key: "slate", label: "Slate", preview: "bg-[hsl(215,20%,55%)]" },
];

const FONT_SIZE_OPTIONS = [
  { key: "sm", label: "Small" },
  { key: "md", label: "Default" },
  { key: "lg", label: "Large" },
  { key: "xl", label: "Extra Large" },
];

interface MyTemplate {
  id: number;
  type: string;
  title: string;
  status: string;
  visibility: string;
  installCount: number;
  createdAt: string;
}

const TYPE_ICONS_MAP: Record<string, typeof Bot> = { bot: Bot, scenario: Zap, pipeline: GitBranch };

export default function Settings() {
  const { preferences, updatePreferences, uploadLogo, removeLogo, isLoading } = useUserPreferences();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: myTemplates = [] } = useQuery<MyTemplate[]>({
    queryKey: ["my-marketplace-templates"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/marketplace/my-templates`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/marketplace/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-marketplace-templates"] });
      toast({ title: "Template removed from marketplace" });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/marketplace/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "unlisted" }),
      });
      if (!res.ok) throw new Error("Failed to unpublish");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-marketplace-templates"] });
      toast({ title: "Template unlisted from marketplace" });
    },
  });

  const handleAccentChange = async (color: string) => {
    setSaving("accent");
    try {
      await updatePreferences({ accentColor: color });
    } catch {}
    setSaving(null);
  };

  const handleFontSizeChange = async (size: string) => {
    setSaving("fontSize");
    try {
      await updatePreferences({ fontSize: size });
    } catch {}
    setSaving(null);
  };

  const handleBillingToggle = async () => {
    setSaving("billing");
    try {
      await updatePreferences({ showBillingWidget: !preferences?.showBillingWidget });
    } catch {}
    setSaving(null);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      alert("Please upload a PNG, JPEG, WebP, or SVG image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Logo must be under 5MB.");
      return;
    }

    setUploading(true);
    try {
      await uploadLogo(file);
    } catch {
      alert("Failed to upload logo. Please try again.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveLogo = async () => {
    setSaving("logo");
    try {
      await removeLogo();
    } catch {}
    setSaving(null);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">
            User <span className="text-gradient">Settings</span>
          </h1>
          <p className="text-muted-foreground font-tech text-sm">
            Personalize your dashboard experience
          </p>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Image className="w-5 h-5 text-primary" />
                Company Logo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload your company logo to personalize the dashboard. It will appear in the navigation bar and on the home screen.
              </p>

              {preferences?.logoUrl && (
                <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50 border border-border/50">
                  <img
                    src={preferences.logoUrl}
                    alt="Company logo"
                    className="w-16 h-16 object-contain rounded-lg bg-background p-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-foreground font-medium">Current logo</p>
                    <p className="text-xs text-muted-foreground">Click below to replace or remove</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={saving === "logo"}
                    className="gap-1"
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </Button>
                </div>
              )}

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      {preferences?.logoUrl ? "Replace Logo" : "Upload Logo"}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="w-5 h-5 text-primary" />
                Accent Color
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Choose an accent color that pairs with the dark theme.
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {ACCENT_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => handleAccentChange(option.key)}
                    disabled={saving === "accent"}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                      preferences?.accentColor === option.key
                        ? "border-foreground/40 bg-secondary/80"
                        : "border-border/50 hover:border-foreground/20 hover:bg-secondary/30"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-full relative", option.preview)}>
                      {preferences?.accentColor === option.key && (
                        <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{option.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Type className="w-5 h-5 text-primary" />
                Font Size
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Adjust the base font size across the dashboard. Larger sizes will enable scrolling on content areas.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {FONT_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => handleFontSizeChange(option.key)}
                    disabled={saving === "fontSize"}
                    className={cn(
                      "px-4 py-3 rounded-lg border font-tech text-sm transition-all",
                      preferences?.fontSize === option.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-foreground/20 hover:bg-secondary/30"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutDashboard className="w-5 h-5 text-primary" />
                Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Show Billing & Subscription on Dashboard</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Display a billing status widget on the home screen with your current plan and renewal info
                  </p>
                </div>
                <button
                  onClick={handleBillingToggle}
                  disabled={saving === "billing"}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    preferences?.showBillingWidget
                      ? "bg-primary"
                      : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform",
                      preferences?.showBillingWidget ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-foreground">Language</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Choose the display language for the dashboard interface
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all",
                        language.code === lang.code
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground hover:border-foreground/20 hover:bg-secondary/30"
                      )}
                    >
                      <span>{lang.flag}</span>
                      <span className="text-xs font-tech truncate">{lang.nativeName}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Store className="w-5 h-5 text-primary" />
                My Published Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Templates you've published to the marketplace.
              </p>
              {myTemplates.length === 0 ? (
                <div className="text-center py-6">
                  <Store className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No published templates yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => navigate("/marketplace")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Browse Marketplace
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {myTemplates.map((t) => {
                    const Icon = TYPE_ICONS_MAP[t.type] || Bot;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  t.status === "approved"
                                    ? "text-emerald-400 border-emerald-500/30"
                                    : t.status === "pending"
                                      ? "text-amber-400 border-amber-500/30"
                                      : "text-red-400 border-red-500/30",
                                )}
                              >
                                {t.status}
                              </Badge>
                              {t.visibility === "unlisted" && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30">
                                  unlisted
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {t.installCount} installs
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-primary"
                            title="Edit template"
                            onClick={() => navigate(`/marketplace/${t.id}`)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-amber-400"
                            title="Unpublish (make unlisted)"
                            onClick={() => unpublishMutation.mutate(t.id)}
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-red-400"
                            title="Delete template"
                            onClick={() => deleteMutation.mutate(t.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
