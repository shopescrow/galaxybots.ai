import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import logoImg from "@assets/galaxybots-logo-transparent.png";
import CaptchaCheckbox from "@/components/auth/CaptchaCheckbox";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ForgotUsername() {
  const [, navigate] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [result, setResult] = useState<{ message: string; email?: string | null } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/forgot-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, contactName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/80 border-slate-700">
        <CardHeader className="text-center">
          <img src={logoImg} alt="GalaxyBots.ai" className="w-72 h-72 mx-auto mb-2 object-contain" />
          <CardTitle className="text-2xl font-bold text-white">Forgot Email</CardTitle>
          <CardDescription className="text-slate-400">Enter your company and contact details to recover your email</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded text-sm">
                {error}
              </div>
            )}
            {result && (
              <div className={`px-4 py-3 rounded text-sm ${result.email ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"}`}>
                <p>{result.message}</p>
                {result.email && <p className="mt-2 font-mono text-lg">{result.email}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-slate-300">Company Name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName" className="text-slate-300">Contact Name</Label>
              <Input
                id="contactName"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="John Smith"
              />
            </div>
            <CaptchaCheckbox onVerified={setCaptchaVerified} />
            <Button type="submit" className="w-full" disabled={loading || !captchaVerified}>
              {loading ? "Looking up..." : "Find My Email"}
            </Button>
            <p className="text-center text-sm text-slate-400">
              <button type="button" onClick={() => navigate("/login")} className="text-purple-400 hover:text-purple-300 underline">
                Back to Sign In
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
