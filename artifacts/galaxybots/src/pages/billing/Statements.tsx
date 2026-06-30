import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  Loader2,
  Bot as BotIcon,
  Cpu,
  Route as RouteIcon,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  ArrowLeft,
  Lock,
  CreditCard,
  Clock,
  Ban,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LineItem {
  lineType: string;
  description: string;
  botName?: string | null;
  model?: string | null;
  modelTier?: string | null;
  serviceRoute?: string | null;
  usageDay?: string | null;
  quantity: number;
  unitRate: number;
  amount: number;
}

interface AttributionBucket {
  botName?: string;
  model?: string;
  modelTier?: string;
  route?: string;
  day?: string;
  credits: number;
}

interface ComposedInvoice {
  clientId: number;
  planTier: string | null;
  status: string;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  includedCredits: number;
  usedCredits: number;
  overageCredits: number;
  overageRatePerCredit: number;
  baseSubtotal: number;
  addonSubtotal: number;
  usageSubtotal: number;
  overageSubtotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  lineItems: LineItem[];
  attribution: {
    byBot: AttributionBucket[];
    byModel: AttributionBucket[];
    byRoute: AttributionBucket[];
    byDay: AttributionBucket[];
  };
}

interface InvoiceSummary {
  id: number;
  invoiceNumber: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  total: string;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  dunningStep?: number;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  finalized: "bg-purple-500/10 border-purple-500/30 text-purple-300",
  paid: "bg-green-500/10 border-green-500/30 text-green-400",
  void: "bg-zinc-500/10 border-zinc-500/30 text-zinc-400",
  failed: "bg-red-500/10 border-red-500/30 text-red-400",
  pending_3ds: "bg-amber-600/10 border-amber-600/30 text-amber-300",
  dunning: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  restricted: "bg-red-600/10 border-red-600/30 text-red-400",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  paid: CheckCircle2,
  finalized: Clock,
  draft: Clock,
  failed: AlertTriangle,
  pending_3ds: CreditCard,
  dunning: AlertTriangle,
  restricted: Ban,
  void: Ban,
};

function getDisplayStatus(inv: InvoiceSummary): string {
  if (inv.status === "paid") return "paid";
  if (inv.status === "void") return "void";
  if (inv.status === "pending_3ds") return "pending_3ds";
  if (inv.status === "failed" && (!inv.dunningStep || inv.dunningStep === 0)) return "failed";
  if (inv.status === "finalized" || inv.status === "failed") {
    if (inv.dunningStep && inv.dunningStep >= 4) return "restricted";
    if (inv.dunningStep && inv.dunningStep >= 1) return "dunning";
    return "unpaid";
  }
  return inv.status;
}

function StatusBadge({ status, dunningStep }: { status: string; dunningStep?: number }) {
  const displayStatus = getDisplayStatus({ status, dunningStep } as InvoiceSummary);

  const styleKey = displayStatus === "unpaid" ? "finalized" : displayStatus;
  const Icon = STATUS_ICONS[styleKey] ?? Clock;

  const LABELS: Record<string, string> = {
    unpaid: "Unpaid",
    paid: "Paid",
    void: "Void",
    failed: "Declined",
    pending_3ds: "Action Required",
    dunning: "Past Due",
    restricted: "Restricted",
    draft: "Draft",
    finalized: "Unpaid",
  };
  const label = LABELS[displayStatus] ?? (displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1));

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-tech uppercase tracking-wide border ${
        STATUS_STYLES[styleKey] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function AttributionTable({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: typeof BotIcon;
  rows: { label: string; credits: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.credits, 0) || 1;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-tech flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Icon className="w-4 h-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No usage recorded.</p>}
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-foreground/80 truncate pr-2">{r.label}</span>
              <span className="font-tech tabular-nums">{r.credits.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
                style={{ width: `${Math.max(2, (r.credits / total) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InvoiceDetail({
  invoice,
  invoiceId,
  onDownload,
  downloading,
  onPayNow,
  payingNow,
}: {
  invoice: ComposedInvoice;
  invoiceId?: number;
  onDownload: () => void;
  downloading: boolean;
  onPayNow?: () => void;
  payingNow?: boolean;
}) {
  const overagePct =
    invoice.usedCredits > 0 ? Math.round((invoice.overageCredits / invoice.usedCredits) * 100) : 0;
  const charges = invoice.lineItems.filter(
    (li) => li.lineType === "base" || li.lineType === "addon" || li.lineType === "overage",
  );
  const isUnpaid = ["finalized", "failed", "pending_3ds"].includes(invoice.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-display font-bold">
              {invoice.invoiceNumber ?? "Current Cycle (Draft)"}
            </h2>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            {fmtDate(invoice.periodStart)} — {fmtDate(invoice.periodEnd)}
            {invoice.planTier ? ` · ${invoice.planTier.toUpperCase()} plan` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isUnpaid && onPayNow && invoiceId && (
            <Button onClick={onPayNow} disabled={payingNow} className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              {payingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Pay Now — {money(invoice.total)}
            </Button>
          )}
          <Button onClick={onDownload} disabled={downloading} variant="outline" className="gap-2">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </Button>
        </div>
      </div>

      {invoice.overageCredits > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            <strong>{invoice.usedCredits.toLocaleString()}</strong> credits used against a{" "}
            <strong>{invoice.includedCredits.toLocaleString()}</strong> allotment —{" "}
            <strong>{invoice.overageCredits.toLocaleString()}</strong> over ({overagePct}%), billed at{" "}
            {money(invoice.overageRatePerCredit)}/credit.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Within allotment — <strong>{invoice.usedCredits.toLocaleString()}</strong> of{" "}
            <strong>{invoice.includedCredits.toLocaleString()}</strong> included credits used. No overage.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AttributionTable
          title="By Bot"
          icon={BotIcon}
          rows={invoice.attribution.byBot.map((b) => ({ label: b.botName ?? "Unattributed", credits: b.credits }))}
        />
        <AttributionTable
          title="By Model / Tier"
          icon={Cpu}
          rows={invoice.attribution.byModel.map((m) => ({
            label: `${m.model} (${m.modelTier})`,
            credits: m.credits,
          }))}
        />
        <AttributionTable
          title="By Service / Route"
          icon={RouteIcon}
          rows={invoice.attribution.byRoute.map((r) => ({ label: r.route ?? "unknown", credits: r.credits }))}
        />
        <AttributionTable
          title="By Day"
          icon={CalendarDays}
          rows={invoice.attribution.byDay.map((d) => ({ label: d.day ?? "", credits: d.credits }))}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-tech uppercase tracking-wide text-muted-foreground">
            Charges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-tech">Description</th>
                  <th className="py-2 px-4 font-tech text-right">Qty</th>
                  <th className="py-2 px-4 font-tech text-right">Rate</th>
                  <th className="py-2 pl-4 font-tech text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((li, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4">{li.description}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{li.quantity.toLocaleString()}</td>
                    <td className="py-2 px-4 text-right tabular-nums">
                      {li.unitRate ? money(li.unitRate) : "—"}
                    </td>
                    <td className="py-2 pl-4 text-right tabular-nums">{money(li.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base subscription</span>
              <span className="tabular-nums">{money(invoice.baseSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Add-ons</span>
              <span className="tabular-nums">{money(invoice.addonSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Overage</span>
              <span className="tabular-nums">{money(invoice.overageSubtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ({(invoice.taxRate * 100).toFixed(2)}%)</span>
              <span className="tabular-nums">{money(invoice.taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-primary pt-2 text-lg font-bold">
              <span>Total Due</span>
              <span className="text-gradient tabular-nums">{money(invoice.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Statements() {
  const { token } = useAuth();
  const [draft, setDraft] = useState<ComposedInvoice | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selected, setSelected] = useState<ComposedInvoice | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [payingNow, setPayingNow] = useState<number | null>(null);

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [draftRes, listRes] = await Promise.all([
        fetch(`${BASE}/api/billing/invoices/draft`, { headers: authHeaders() }),
        fetch(`${BASE}/api/billing/invoices`, { headers: authHeaders() }),
      ]);
      const draftData = await draftRes.json();
      const listData = await listRes.json();
      if (draftRes.ok) setDraft(draftData.invoice);
      else setDraft(null);
      if (listRes.ok) setInvoices(listData.invoices ?? []);
    } catch {
      setError("Unable to load statements. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadPdf = useCallback(
    async (idOrDraft: number | "draft", label: string) => {
      setDownloading(String(idOrDraft));
      try {
        const res = await fetch(`${BASE}/api/billing/invoices/${idOrDraft}/pdf`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `galaxybots-${label}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        setError("Failed to download PDF.");
      } finally {
        setDownloading(null);
      }
    },
    [authHeaders],
  );

  const openInvoice = useCallback(
    async (id: number) => {
      setLoading(true);
      try {
        const res = await fetch(`${BASE}/api/billing/invoices/${id}`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok) {
          setSelected(data.invoice);
          setSelectedId(id);
        } else {
          setError(data.error ?? "Failed to load invoice");
        }
      } catch {
        setError("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    },
    [authHeaders],
  );

  const handlePayNow = useCallback(
    async (invoiceId: number) => {
      setPayingNow(invoiceId);
      try {
        const res = await fetch(`${BASE}/api/billing/invoices/${invoiceId}/pay`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error ?? "Failed to create payment session");
        }
      } catch {
        setError("Failed to initiate payment");
      } finally {
        setPayingNow(null);
      }
    },
    [authHeaders],
  );

  const closeCycle = useCallback(async () => {
    if (!confirm("Close the current billing cycle? This finalizes an immutable invoice, resets your credit balance to the plan allotment, and starts a new cycle.")) {
      return;
    }
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/billing/invoices/close-cycle`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to close cycle");
      } else {
        await load();
      }
    } catch {
      setError("Failed to close cycle");
    } finally {
      setWorking(false);
    }
  }, [authHeaders, load]);

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-tech text-sm mb-3">
              <Receipt className="w-3.5 h-3.5" />
              <span>Statements</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold">
              Itemized <span className="text-gradient">Statements</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Every credit traced back to its bot, model tier, service route, and day.
            </p>
          </div>
          {!selected && (
            <Button variant="outline" onClick={closeCycle} disabled={working} className="gap-2">
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Close Current Cycle
            </Button>
          )}
          {selected && (
            <Button variant="outline" onClick={() => { setSelected(null); setSelectedId(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Statements
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        )}

        {!loading && selected && (
          <InvoiceDetail
            invoice={selected}
            invoiceId={selectedId ?? undefined}
            downloading={downloading === String(selectedId)}
            onDownload={() => {
              if (selectedId) downloadPdf(selectedId, selected.invoiceNumber ?? "statement");
            }}
            onPayNow={["finalized","failed","pending_3ds"].includes(selected.status) && selectedId ? () => handlePayNow(selectedId) : undefined}
            payingNow={payingNow === selectedId}
          />
        )}

        {!loading && !selected && (
          <div className="space-y-10">
            {draft && (
              <section>
                <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" /> Current Cycle (Estimate to Date)
                </h2>
                <InvoiceDetail
                  invoice={draft}
                  downloading={downloading === "draft"}
                  onDownload={() => downloadPdf("draft", "statement-draft")}
                />
              </section>
            )}

            <section>
              <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-400" /> Finalized Invoices
              </h2>
              {invoices.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No finalized invoices yet. Close a billing cycle to generate one.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv) => {
                    const displayStatus = getDisplayStatus(inv);
                    const isUnpaid = ["finalized", "failed", "pending_3ds"].includes(inv.status);
                    return (
                      <Card key={inv.id} className="transition-colors hover:border-primary/40">
                        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                          <div className="flex items-center gap-4">
                            <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5">
                              <FileText className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-tech font-semibold">{inv.invoiceNumber}</span>
                                <StatusBadge status={inv.status} dunningStep={inv.dunningStep} />
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {fmtDate(inv.periodStart)} — {fmtDate(inv.periodEnd)}
                                {inv.dueAt && !inv.paidAt ? ` · Due ${fmtDate(inv.dueAt)}` : ""}
                                {inv.paidAt ? ` · Paid ${fmtDate(inv.paidAt)}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold tabular-nums">
                              {money(parseFloat(inv.total))}
                            </span>
                            {isUnpaid && (
                              <Button
                                size="sm"
                                className="gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                                disabled={payingNow === inv.id}
                                onClick={() => handlePayNow(inv.id)}
                              >
                                {payingNow === inv.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CreditCard className="w-3 h-3" />
                                )}
                                Pay Now
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openInvoice(inv.id)}>
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              disabled={downloading === String(inv.id)}
                              onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                            >
                              {downloading === String(inv.id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              PDF
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
