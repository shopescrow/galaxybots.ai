import { useState } from "react";
import { useDemo } from "@/contexts/DemoContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  Sparkles, ArrowRight, Loader2, CheckCircle, ArrowLeft,
  DollarSign, Clock, MessageSquare
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function DemoClaim() {
  const { demoSession, roiData, clearDemo } = useDemo();
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    companyName: "",
    contactName: "",
    displayName: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoSession) {
      setError("No active demo session to claim");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch(`${BASE}/api/demo/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: demoSession.sessionToken,
          ...formData,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Claim failed" }));
        throw new Error(data.error || "Failed to claim session");
      }

      const data = await res.json();

      clearDemo();
      await login(formData.email, formData.password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!demoSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No active demo session.</p>
          <Button variant="outline" onClick={() => navigate("/demo")}>
            Start a Demo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full space-y-6"
      >
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => navigate("/demo")}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Demo
        </Button>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-tech text-sm mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            CLAIM YOUR SESSION
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">
            Save Your Results
          </h1>
          <p className="text-muted-foreground">
            Create your account and your demo session — including all bot insights and ROI data — will be migrated to your new account.
          </p>
        </div>

        {roiData && (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-card border border-border/50">
              <Clock className="w-4 h-4 text-cyan mx-auto mb-1" />
              <div className="text-lg font-bold text-cyan">{roiData.estimatedHoursSaved}h</div>
              <div className="text-[10px] text-muted-foreground font-tech">Saved</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-card border border-border/50">
              <DollarSign className="w-4 h-4 text-gold mx-auto mb-1" />
              <div className="text-lg font-bold text-gold">${roiData.estimatedCostSavings.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground font-tech">Value</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-card border border-border/50">
              <MessageSquare className="w-4 h-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-primary">{roiData.messageCount}</div>
              <div className="text-[10px] text-muted-foreground font-tech">Insights</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 glass-panel p-6 rounded-2xl">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData((d) => ({ ...d, password: e.target.value }))}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="8+ characters"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Company Name
            </label>
            <input
              type="text"
              required
              value={formData.companyName}
              onChange={(e) => setFormData((d) => ({ ...d, companyName: e.target.value }))}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Your company"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              required
              value={formData.contactName}
              onChange={(e) =>
                setFormData((d) => ({
                  ...d,
                  contactName: e.target.value,
                  displayName: e.target.value,
                }))
              }
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Full name"
            />
          </div>

          <Button
            type="submit"
            variant="glow"
            className="w-full gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Account...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Create Account & Claim Session
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Already have an account?{" "}
          <a href="/login" className="text-primary underline">
            Log in
          </a>
        </p>
      </motion.div>
    </div>
  );
}
