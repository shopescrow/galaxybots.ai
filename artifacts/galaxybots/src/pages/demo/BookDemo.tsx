import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function BookDemo() {
  const prefersReducedMotion = useReducedMotion();
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch(`${BASE}/api/demo/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Submission failed" }));
        throw new Error(data.error || "Failed to submit request");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold mb-3">Request Received!</h1>
            <p className="text-muted-foreground">
              Thanks, <strong>{formData.name}</strong>. We'll be in touch with you at{" "}
              <strong>{formData.email}</strong> shortly to schedule your demo.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </motion.div>
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
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Button>
        </Link>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-tech text-sm mb-4">
            <CalendarCheck className="w-3.5 h-3.5" />
            BOOK A DEMO
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">
            See GalaxyBots in Action
          </h1>
          <p className="text-muted-foreground">
            Fill in your details and our team will reach out to schedule a personalized demo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 glass-panel p-6 rounded-2xl">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Full Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Company <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="company"
              required
              value={formData.company}
              onChange={handleChange}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Work Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="jane@acmecorp.com"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div>
            <label className="text-xs font-tech text-muted-foreground uppercase tracking-wider block mb-1.5">
              Use Case / Message
            </label>
            <textarea
              name="message"
              rows={4}
              value={formData.message}
              onChange={handleChange}
              className="w-full bg-secondary/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Tell us about your business and what you're hoping GalaxyBots can help with..."
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
                Submitting...
              </>
            ) : (
              <>
                <CalendarCheck className="w-4 h-4" />
                Request a Demo
              </>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
