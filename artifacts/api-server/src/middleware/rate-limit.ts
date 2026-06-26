import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction, RequestHandler } from "express";

function getClientKey(req: Request): string {
  if (req.user?.clientId) {
    return `client-${req.user.clientId}`;
  }
  return req.ip || `anon-${Date.now()}`;
}

const PLAN_LLM_LIMITS: Record<string, number> = {
  single: 15,
  team: 30,
  department: 60,
  enterprise: 120,
};

const PLAN_GENERAL_LIMITS: Record<string, number> = {
  single: 100,
  team: 200,
  department: 400,
  enterprise: 800,
};

export const llmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => {
    const plan = req.user?.plan || "single";
    return PLAN_LLM_LIMITS[plan] ?? PLAN_LLM_LIMITS.single;
  },
  keyGenerator: getClientKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  message: { error: "Too many requests. Please try again later." },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => {
    const plan = req.user?.plan || "single";
    return PLAN_GENERAL_LIMITS[plan] ?? PLAN_GENERAL_LIMITS.single;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  message: { error: "Too many requests. Please try again later." },
});

// ── Tenant fair-share concurrency ─────────────────────────────────────────────
// Rate limits cap requests-per-minute but don't stop one heavy tenant from
// holding many slow (LLM/orchestration) requests in flight at once and starving
// others. This middleware bounds *concurrent* in-flight expensive requests per
// tenant. Each tenant gets a per-plan ceiling, but under global contention the
// effective ceiling shrinks to a fair share so no single tenant can monopolize
// shared capacity. Slots are released when the response finishes.

// Per-plan hard ceiling on concurrent expensive requests.
const PLAN_CONCURRENCY_LIMITS: Record<string, number> = {
  single: 3,
  team: 6,
  department: 12,
  enterprise: 24,
};

// Total concurrent expensive requests the server will run across all tenants
// before fair-share throttling kicks in.
const GLOBAL_CONCURRENCY_CAP = 60;
// Every tenant is always allowed at least this many, even under contention.
const MIN_FAIR_SHARE = 1;

const activeByTenant = new Map<string, number>();
let globalActive = 0;

function planCeiling(plan: string | undefined): number {
  return PLAN_CONCURRENCY_LIMITS[plan ?? "single"] ?? PLAN_CONCURRENCY_LIMITS.single;
}

/**
 * Bound concurrent in-flight expensive requests per tenant with fair sharing.
 * Returns 429 when the tenant is at its effective ceiling so the client can
 * back off and retry, rather than letting one tenant exhaust shared capacity.
 */
export const tenantFairShareConcurrency: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const key = getClientKey(req);
  const plan = req.user?.plan;
  const current = activeByTenant.get(key) ?? 0;

  // Under global contention, shrink each tenant's ceiling to a fair share of
  // remaining capacity split across currently-active tenants (plus this one).
  const contended = globalActive >= GLOBAL_CONCURRENCY_CAP;
  const activeTenants = activeByTenant.size + (current === 0 ? 1 : 0);
  const fairShare = Math.max(MIN_FAIR_SHARE, Math.floor(GLOBAL_CONCURRENCY_CAP / Math.max(1, activeTenants)));
  const ceiling = contended ? Math.min(planCeiling(plan), fairShare) : planCeiling(plan);

  if (current >= ceiling) {
    res.setHeader("Retry-After", "2");
    res.status(429).json({
      error: "Your account has too many concurrent requests in progress. Please wait for them to finish and retry.",
    });
    return;
  }

  activeByTenant.set(key, current + 1);
  globalActive += 1;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (activeByTenant.get(key) ?? 1) - 1;
    if (n <= 0) activeByTenant.delete(key);
    else activeByTenant.set(key, n);
    globalActive = Math.max(0, globalActive - 1);
  };

  res.on("finish", release);
  res.on("close", release);
  next();
};
