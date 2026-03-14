import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import logoImg from "@assets/galaxybots-logo-transparent.png";
import CaptchaCheckbox from "@/components/auth/CaptchaCheckbox";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [result, setResult] = useState<{ message: string; success?: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      const data = await res.json();
      setResult(data);
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/80 border-slate-700">
        <CardHeader className="text-center">
          <img src={logoImg} alt="GalaxyBots.ai" className="w-72 h-72 mx-auto mb-2 object-contain" />
          <CardTitle className="text-2xl font-bold text-white">Reset Password</CardTitle>
          <CardDescription className="text-slate-400">
            {step === "request"
              ? "Enter your email to receive a reset token"
              : "Enter the reset token and your new password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded text-sm mb-4">
              {error}
            </div>
          )}
          {result && (
            <div className={`px-4 py-3 rounded text-sm mb-4 ${result.success ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"}`}>
              <p>{result.message}</p>
            </div>
          )}

          {step === "request" ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white"
                  placeholder="you@company.com"
                />
              </div>
              <CaptchaCheckbox onVerified={setCaptchaVerified} />
              <Button type="submit" className="w-full" disabled={loading || !captchaVerified}>
                {loading ? "Sending..." : "Send Reset Token"}
              </Button>
              <p className="text-center text-sm text-slate-400">
                Already have a token?{" "}
                <button type="button" onClick={() => setStep("reset")} className="text-purple-400 hover:text-purple-300 underline">
                  Enter it here
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token" className="text-slate-300">Reset Token</Label>
                <Input
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white"
                  placeholder="Paste your reset token"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-slate-300">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white"
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-300">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white"
                  placeholder="Re-enter new password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-slate-400 mt-4">
            <button type="button" onClick={() => navigate("/login")} className="text-purple-400 hover:text-purple-300 underline">
              Back to Sign In
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
