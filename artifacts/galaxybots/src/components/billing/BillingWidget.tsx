import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BillingInfo {
  plan: string;
  status: string;
  renewalDate: string | null;
}

const PLAN_NAMES: Record<string, string> = {
  single: "Single Director",
  team: "Department Team",
  enterprise: "Enterprise Command",
};

export function BillingWidget() {
  const { token } = useAuth();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${BASE}/api/billing/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch billing");
        return res.json();
      })
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!billing) return null;

  const planName = PLAN_NAMES[billing.plan] || billing.plan;
  const isActive = billing.status === "active";
  const statusColor = isActive ? "text-green-400" : "text-amber-400";
  const statusBg = isActive ? "bg-green-500/10 border-green-500/30" : "bg-amber-500/10 border-amber-500/30";
  const statusLabel = isActive ? "Active" : billing.status === "trial" ? "Trial" : billing.status.charAt(0).toUpperCase() + billing.status.slice(1);

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm font-bold tracking-wide uppercase mb-2">
              Billing & Subscription
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Plan:</span>
                <span className="text-sm font-medium text-foreground">{planName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-tech border ${statusBg} ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>
              {billing.renewalDate && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Renewal:</span>
                  <span className="text-sm font-medium text-foreground">
                    {new Date(billing.renewalDate).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>
            <Link href="/billing" className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline font-tech">
              Manage Subscription
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
