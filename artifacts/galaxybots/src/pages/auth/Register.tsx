import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CaptchaCheckbox from "@/components/auth/CaptchaCheckbox";

export default function Register() {
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    contactName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await register({
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
        contactName: formData.contactName,
      });
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/80 border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">Create Account</CardTitle>
          <CardDescription className="text-slate-400">Get started with GalaxyBots</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="contactName" className="text-slate-300">Your Name</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={handleChange("contactName")}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-slate-300">Company Name</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={handleChange("companyName")}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={handleChange("email")}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={handleChange("password")}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange("confirmPassword")}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="Re-enter your password"
              />
            </div>
            <CaptchaCheckbox onVerified={setCaptchaVerified} />
            <Button type="submit" className="w-full" disabled={loading || !captchaVerified}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
            <p className="text-center text-sm text-slate-400">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Sign in
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
