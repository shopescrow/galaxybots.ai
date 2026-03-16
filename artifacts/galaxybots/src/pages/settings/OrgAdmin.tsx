import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Key, Copy, Check, Settings2, UserMinus, UserCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Member {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
  ssoProvider: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface SSOConfig {
  id: number;
  providerType: string;
  idpMetadataUrl: string | null;
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  oidcClientId: string | null;
  oidcIssuerUrl: string | null;
  domainHint: string;
  jitDefaultRole: string;
  forceSso: boolean;
  enabled: boolean;
  hasScimToken: boolean;
  scimGroupRoleMapping: Record<string, string> | null;
  jitDefaultPermissionProfileId: number | null;
}

export default function OrgAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"sso" | "members" | "scim">("sso");
  const [members, setMembers] = useState<Member[]>([]);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scimToken, setScimToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const [formData, setFormData] = useState({
    providerType: "saml" as "saml" | "oidc",
    idpMetadataUrl: "",
    idpEntityId: "",
    idpSsoUrl: "",
    idpCert: "",
    oidcClientId: "",
    oidcClientSecret: "",
    oidcIssuerUrl: "",
    domainHint: "",
    jitDefaultRole: "viewer",
    forceSso: false,
    enabled: true,
    scimGroupRoleMapping: "",
    jitDefaultPermissionProfileId: "",
  });

  const headers = { "Content-Type": "application/json" };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [membersRes, ssoRes] = await Promise.all([
        fetch(`${BASE}/api/org/members`, { credentials: "include" }),
        fetch(`${BASE}/api/org/sso-config`, { credentials: "include" }),
      ]);
      if (membersRes.ok) setMembers(await membersRes.json());
      if (ssoRes.ok) {
        const config = await ssoRes.json();
        setSsoConfig(config);
        if (config) {
          setFormData({
            providerType: config.providerType || "saml",
            idpMetadataUrl: config.idpMetadataUrl || "",
            idpEntityId: config.idpEntityId || "",
            idpSsoUrl: config.idpSsoUrl || "",
            idpCert: "",
            oidcClientId: config.oidcClientId || "",
            oidcClientSecret: "",
            oidcIssuerUrl: config.oidcIssuerUrl || "",
            domainHint: config.domainHint || "",
            jitDefaultRole: config.jitDefaultRole || "viewer",
            forceSso: config.forceSso || false,
            enabled: config.enabled ?? true,
            scimGroupRoleMapping: config.scimGroupRoleMapping ? JSON.stringify(config.scimGroupRoleMapping, null, 2) : "",
            jitDefaultPermissionProfileId: config.jitDefaultPermissionProfileId ? String(config.jitDefaultPermissionProfileId) : "",
          });
        }
      }
    } catch {
      toast({ title: "Error", description: "Failed to load organization data", variant: "destructive" });
    }
    setLoading(false);
  }

  async function saveSsoConfig() {
    setSaving(true);
    try {
      let parsedGroupRoleMapping = null;
      if (formData.scimGroupRoleMapping.trim()) {
        try {
          parsedGroupRoleMapping = JSON.parse(formData.scimGroupRoleMapping);
        } catch {
          toast({ title: "Error", description: "SCIM Group Role Mapping must be valid JSON", variant: "destructive" });
          setSaving(false);
          return;
        }
      }

      const payload = {
        ...formData,
        scimGroupRoleMapping: parsedGroupRoleMapping,
        jitDefaultPermissionProfileId: formData.jitDefaultPermissionProfileId ? Number(formData.jitDefaultPermissionProfileId) : null,
      };

      const res = await fetch(`${BASE}/api/org/sso-config`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }
      const config = await res.json();
      setSsoConfig(config);
      toast({ title: "SSO Configuration Saved", description: "Your SSO settings have been updated." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save SSO config";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function generateScimToken() {
    try {
      const res = await fetch(`${BASE}/api/org/scim-token`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      setScimToken(data.token);
      toast({ title: "SCIM Token Generated", description: "Copy and save this token — it won't be shown again." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate SCIM token";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  async function updateMember(memberId: number, updates: { role?: string; isActive?: boolean }) {
    try {
      const res = await fetch(`${BASE}/api/org/members/${memberId}`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }
      await loadData();
      toast({ title: "Member Updated" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update member";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  function copyToken() {
    if (scimToken) {
      navigator.clipboard.writeText(scimToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs = [
    { id: "sso" as const, label: "SSO Configuration", icon: Shield },
    { id: "members" as const, label: "Team Members", icon: Users },
    { id: "scim" as const, label: "SCIM Provisioning", icon: Key },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-purple-400" />
          Organization Administration
        </h1>
        <p className="text-slate-400 mt-1">Manage SSO, team members, and automated provisioning for your enterprise.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-700 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-purple-400 text-purple-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "sso" && (
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Single Sign-On (SSO)</CardTitle>
            <CardDescription className="text-slate-400">
              Connect your identity provider for seamless enterprise authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-300">Provider Type</Label>
              <Select value={formData.providerType} onValueChange={(v) => setFormData({ ...formData, providerType: v as "saml" | "oidc" })}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saml">SAML 2.0</SelectItem>
                  <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Email Domain</Label>
              <Input
                value={formData.domainHint}
                onChange={(e) => setFormData({ ...formData, domainHint: e.target.value })}
                placeholder="company.com"
                className="bg-slate-700/50 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500">Users with this email domain will be routed to SSO login.</p>
            </div>

            {formData.providerType === "saml" && (
              <>
                <div className="space-y-2">
                  <Label className="text-slate-300">IdP SSO URL</Label>
                  <Input
                    value={formData.idpSsoUrl}
                    onChange={(e) => setFormData({ ...formData, idpSsoUrl: e.target.value })}
                    placeholder="https://idp.company.com/sso/saml"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">IdP Entity ID</Label>
                  <Input
                    value={formData.idpEntityId}
                    onChange={(e) => setFormData({ ...formData, idpEntityId: e.target.value })}
                    placeholder="https://idp.company.com"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">IdP Metadata URL (optional)</Label>
                  <Input
                    value={formData.idpMetadataUrl}
                    onChange={(e) => setFormData({ ...formData, idpMetadataUrl: e.target.value })}
                    placeholder="https://idp.company.com/metadata"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                  <p className="text-xs text-slate-400 font-medium mb-1">SP Metadata URL (provide to your IdP)</p>
                  <code className="text-xs text-purple-300">{window.location.origin}/api/sso/saml/metadata</code>
                </div>
              </>
            )}

            {formData.providerType === "oidc" && (
              <>
                <div className="space-y-2">
                  <Label className="text-slate-300">Issuer URL</Label>
                  <Input
                    value={formData.oidcIssuerUrl}
                    onChange={(e) => setFormData({ ...formData, oidcIssuerUrl: e.target.value })}
                    placeholder="https://login.company.com"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Client ID</Label>
                  <Input
                    value={formData.oidcClientId}
                    onChange={(e) => setFormData({ ...formData, oidcClientId: e.target.value })}
                    placeholder="your-oidc-client-id"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Client Secret</Label>
                  <Input
                    type="password"
                    value={formData.oidcClientSecret}
                    onChange={(e) => setFormData({ ...formData, oidcClientSecret: e.target.value })}
                    placeholder="Enter client secret"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label className="text-slate-300">Default Role for New SSO Users</Label>
              <Select value={formData.jitDefaultRole} onValueChange={(v) => setFormData({ ...formData, jitDefaultRole: v })}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-slate-300">Force SSO</Label>
                <p className="text-xs text-slate-500">Disable password login for users on this domain.</p>
              </div>
              <Switch checked={formData.forceSso} onCheckedChange={(v) => setFormData({ ...formData, forceSso: v })} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-slate-300">Enabled</Label>
                <p className="text-xs text-slate-500">Enable or disable SSO for your organization.</p>
              </div>
              <Switch checked={formData.enabled} onCheckedChange={(v) => setFormData({ ...formData, enabled: v })} />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">SCIM Group Role Mapping (JSON)</Label>
              <textarea
                className="w-full bg-slate-900/50 border border-slate-600 rounded-md px-3 py-2 text-slate-200 text-sm font-mono"
                rows={4}
                placeholder={'{"engineering": "viewer", "platform-admins": "admin"}'}
                value={formData.scimGroupRoleMapping}
                onChange={(e) => setFormData({ ...formData, scimGroupRoleMapping: e.target.value })}
              />
              <p className="text-xs text-slate-500">Maps IdP group names to platform roles (admin, viewer, owner). Merges with defaults.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Default Permission Profile ID</Label>
              <Input
                type="number"
                placeholder="Permission profile ID for JIT-provisioned users"
                value={formData.jitDefaultPermissionProfileId}
                onChange={(e) => setFormData({ ...formData, jitDefaultPermissionProfileId: e.target.value })}
                className="bg-slate-900/50 border-slate-600 text-slate-200"
              />
              <p className="text-xs text-slate-500">Bot permission profile automatically applied to new SSO/SCIM users.</p>
            </div>

            <Button onClick={saveSsoConfig} disabled={saving} className="w-full bg-purple-600 hover:bg-purple-700">
              {saving ? "Saving..." : ssoConfig ? "Update SSO Configuration" : "Enable SSO"}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "members" && (
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              Team Members ({members.length})
            </CardTitle>
            <CardDescription className="text-slate-400">
              Manage roles and access for your organization members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className={`flex items-center justify-between p-3 rounded-lg border ${member.isActive ? "bg-slate-900/30 border-slate-700" : "bg-red-950/10 border-red-900/30"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">{member.displayName || member.email}</span>
                      {member.ssoProvider && (
                        <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
                          {member.ssoProvider.toUpperCase()}
                        </Badge>
                      )}
                      {!member.isActive && (
                        <Badge variant="destructive" className="text-xs">Deactivated</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{member.email}</p>
                    {member.lastLoginAt && (
                      <p className="text-xs text-slate-500">Last login: {new Date(member.lastLoginAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {member.id !== user?.userId && (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(v) => updateMember(member.id, { role: v })}
                        >
                          <SelectTrigger className="w-28 bg-slate-700/50 border-slate-600 text-white text-xs h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateMember(member.id, { isActive: !member.isActive })}
                          className={member.isActive ? "text-red-400 hover:text-red-300" : "text-green-400 hover:text-green-300"}
                        >
                          {member.isActive ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </Button>
                      </>
                    )}
                    {member.id === user?.userId && (
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">You</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "scim" && (
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-400" />
              SCIM 2.0 Provisioning
            </CardTitle>
            <CardDescription className="text-slate-400">
              Automate user provisioning and deprovisioning from your identity provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
              <div>
                <p className="text-xs text-slate-400 font-medium">SCIM Base URL</p>
                <code className="text-sm text-purple-300">{window.location.origin}/api/scim/v2</code>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Supported Operations</p>
                <div className="flex gap-2 mt-1">
                  {["GET Users", "POST Create", "PATCH Update", "DELETE Deactivate"].map((op) => (
                    <Badge key={op} variant="outline" className="text-xs border-slate-600 text-slate-300">{op}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {!ssoConfig && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm text-yellow-300">Configure SSO first before generating a SCIM token.</p>
              </div>
            )}

            {ssoConfig && (
              <>
                {scimToken ? (
                  <div className="space-y-2">
                    <Label className="text-slate-300">Your SCIM Bearer Token</Label>
                    <div className="flex gap-2">
                      <Input value={scimToken} readOnly className="bg-slate-700/50 border-slate-600 text-white font-mono text-xs" />
                      <Button variant="outline" size="sm" onClick={copyToken} className="border-slate-600">
                        {tokenCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-red-400">Save this token now. It will not be displayed again.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">
                      {ssoConfig.hasScimToken
                        ? "A SCIM token has been generated. Generate a new one to replace it."
                        : "Generate a SCIM bearer token for your identity provider."}
                    </p>
                    <Button onClick={generateScimToken} variant="outline" className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10">
                      {ssoConfig.hasScimToken ? "Regenerate SCIM Token" : "Generate SCIM Token"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
