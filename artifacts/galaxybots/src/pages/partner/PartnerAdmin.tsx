import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link, Copy, Users, Palette, LogOut, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PartnerSession = {
  ref: string;
  partnerName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  welcomeMessage: string;
  offer: string | null;
};

type ReferredClient = {
  id: number;
  companyName: string;
  contactName: string;
  contactEmail: string;
  plan: string;
  status: string;
  registeredAt: string;
};

export default function PartnerAdmin() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [loginForm, setLoginForm] = useState({ ref: "", password: "" });
  const [session, setSession] = useState<PartnerSession | null>(null);
  const [loginError, setLoginError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"clients" | "branding">("clients");

  const [brandingForm, setBrandingForm] = useState({
    platformName: "",
    logoUrl: "",
    primaryColor: "",
    welcomeMessage: "",
    offer: "",
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/partner/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: loginForm.ref, password: loginForm.password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Invalid credentials");
      }
      return res.json() as Promise<PartnerSession>;
    },
    onSuccess: (data) => {
      setSession(data);
      setLoginError("");
      setBrandingForm({
        platformName: data.partnerName,
        logoUrl: data.logoUrl || "",
        primaryColor: data.primaryColor || "",
        welcomeMessage: data.welcomeMessage,
        offer: data.offer || "",
      });
    },
    onError: (err: Error) => {
      setLoginError(err.message);
    },
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ReferredClient[]>({
    queryKey: ["partner-clients", session?.ref],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/partner/${encodeURIComponent(session!.ref)}/clients`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminPassword: loginForm.password }),
        }
      );
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
    enabled: !!session,
  });

  const updateBrandingMutation = useMutation({
    mutationFn: async (form: typeof brandingForm) => {
      const res = await fetch(`${BASE}/api/partner/${encodeURIComponent(session!.ref)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: loginForm.password,
          platformName: form.platformName,
          logoUrl: form.logoUrl,
          primaryColor: form.primaryColor,
          welcomeMessage: form.welcomeMessage,
          offer: form.offer,
        }),
      });
      if (!res.ok) throw new Error("Failed to update branding");
      return res.json();
    },
    onSuccess: (data) => {
      setSession((prev) => prev ? { ...prev, partnerName: data.partnerName, logoUrl: data.logoUrl, primaryColor: data.primaryColor, welcomeMessage: data.welcomeMessage, offer: data.offer } : prev);
      toast({ title: "Branding updated", description: "Your partner branding has been saved." });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const referralLink = session ? `${window.location.origin}${BASE}/partner/${session.ref}` : "";

  const copyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!session) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-16 max-w-md">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
          >
            <div className="text-center mb-8">
              <h1 className="text-2xl font-display font-bold mb-2">Partner Admin</h1>
              <p className="text-muted-foreground font-tech text-sm">Sign in to manage your partner account</p>
            </div>
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg font-display">Partner Login</CardTitle>
                <CardDescription>Enter your partner slug and admin password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ref" className="font-tech text-xs uppercase tracking-wider">Partner Slug</Label>
                  <Input
                    id="ref"
                    placeholder="e.g. bingolingo"
                    value={loginForm.ref}
                    onChange={e => setLoginForm(p => ({ ...p, ref: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="font-tech text-xs uppercase tracking-wider">Admin Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                  />
                </div>
                {loginError && (
                  <p className="text-sm text-destructive font-tech">{loginError}</p>
                )}
                <Button
                  className="w-full"
                  variant="glow"
                  onClick={() => loginMutation.mutate()}
                  disabled={loginMutation.isPending || !loginForm.ref || !loginForm.password}
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
          className="space-y-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">{session.partnerName} — Partner Admin</h1>
              <p className="text-muted-foreground font-tech text-sm mt-1">Manage your referred clients and branding</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 font-tech text-xs"
              onClick={() => setSession(null)}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-1">Your Referral Link</div>
                  <code className="text-sm text-foreground break-all">{referralLink}</code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 font-tech text-xs shrink-0"
                  onClick={copyReferralLink}
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 border-b border-border/40">
            <button
              onClick={() => setActiveTab("clients")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-tech transition-colors border-b-2 -mb-px ${
                activeTab === "clients"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Referred Clients
              {clients.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{clients.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("branding")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-tech transition-colors border-b-2 -mb-px ${
                activeTab === "branding"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Palette className="w-4 h-4" />
              Branding
            </button>
          </div>

          {activeTab === "clients" && (
            <div className="space-y-4">
              {clientsLoading ? (
                <div className="text-center py-12 text-muted-foreground font-tech text-sm animate-pulse">Loading clients...</div>
              ) : clients.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground font-tech text-sm">No referred clients yet.</p>
                  <p className="text-xs text-muted-foreground font-tech">Share your referral link to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/40">
                  <table className="w-full text-sm font-tech">
                    <thead>
                      <tr className="border-b border-border/40 bg-secondary/30">
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Company</th>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Contact</th>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Plan</th>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((client) => (
                        <tr key={client.id} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{client.companyName}</td>
                          <td className="px-4 py-3">
                            <div>{client.contactName}</div>
                            <div className="text-xs text-muted-foreground">{client.contactEmail}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs capitalize">{client.plan}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs capitalize">{client.status}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(client.registeredAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "branding" && (
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="text-lg font-display">Branding Settings</CardTitle>
                <CardDescription>Update how your platform appears to clients who arrive via your referral link</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="font-tech text-xs uppercase tracking-wider">Platform Name</Label>
                    <Input
                      placeholder="Your Brand Name"
                      value={brandingForm.platformName}
                      onChange={e => setBrandingForm(p => ({ ...p, platformName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-tech text-xs uppercase tracking-wider">Logo URL</Label>
                    <Input
                      placeholder="https://example.com/logo.png"
                      value={brandingForm.logoUrl}
                      onChange={e => setBrandingForm(p => ({ ...p, logoUrl: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-tech text-xs uppercase tracking-wider">Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="#6366f1"
                        value={brandingForm.primaryColor}
                        onChange={e => setBrandingForm(p => ({ ...p, primaryColor: e.target.value }))}
                      />
                      {brandingForm.primaryColor && (
                        <div
                          className="w-10 h-10 rounded-lg border border-border/40 shrink-0"
                          style={{ backgroundColor: brandingForm.primaryColor }}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-tech">Hex color code, e.g. #6366f1</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-tech text-xs uppercase tracking-wider">Offer Text</Label>
                    <Input
                      placeholder="e.g. 30 days free on any plan"
                      value={brandingForm.offer}
                      onChange={e => setBrandingForm(p => ({ ...p, offer: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-tech text-xs uppercase tracking-wider">Welcome Message</Label>
                  <Textarea
                    placeholder="Welcome message shown on the partner landing page..."
                    value={brandingForm.welcomeMessage}
                    onChange={e => setBrandingForm(p => ({ ...p, welcomeMessage: e.target.value }))}
                    rows={4}
                  />
                </div>
                <Button
                  variant="glow"
                  className="gap-2"
                  onClick={() => updateBrandingMutation.mutate(brandingForm)}
                  disabled={updateBrandingMutation.isPending || !brandingForm.platformName || !brandingForm.welcomeMessage}
                >
                  {updateBrandingMutation.isPending ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    "Save Branding"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}
