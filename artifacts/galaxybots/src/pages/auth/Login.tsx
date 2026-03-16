import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import logoImg from "@assets/galaxybots-logo-transparent.png";
import CaptchaCheckbox from "@/components/auth/CaptchaCheckbox";
import { Eye, EyeOff, Play } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/80 border-slate-700">
        <CardHeader className="text-center">
          <img src={logoImg} alt="GalaxyBots.ai" className="w-72 h-72 mx-auto mb-2 object-contain" />
          <CardTitle className="text-2xl font-bold text-white">Welcome Back</CardTitle>
          <CardDescription className="text-slate-400">Sign in to your GalaxyBots account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email or Username</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="you@company.com or your username"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white pr-10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <button
                type="button"
                onClick={() => navigate("/forgot-username")}
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Forgot email?
              </button>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Forgot password?
              </button>
            </div>
            <CaptchaCheckbox onVerified={setCaptchaVerified} />
            <Button type="submit" className="w-full" disabled={loading || !captchaVerified}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-center text-sm text-slate-400">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Register
              </button>
            </p>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-800/80 px-2 text-slate-500">or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => navigate("/demo")}
            >
              <Play className="w-4 h-4" />
              Try Live Demo — No Account Needed
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
