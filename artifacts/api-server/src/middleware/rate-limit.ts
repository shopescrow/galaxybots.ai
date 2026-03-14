import rateLimit from "express-rate-limit";
import type { Request } from "express";

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
