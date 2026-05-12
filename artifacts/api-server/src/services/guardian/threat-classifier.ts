import crypto from "node:crypto";

interface ThreatClassification {
  domain: string;
  severity: number;
  blastRadius: number;
}

const DOMAIN_SEVERITY_BASE: Record<string, number> = {
  code: 60,
  security: 85,
  ai_safety: 75,
  client_health: 70,
  performance: 55,
  data_integrity: 80,
  compliance: 78,
  dependency: 65,
  predictive: 72,
  aeo: 68,
  piratemonster: 60,
};

const SEVERITY_KEYWORDS: Array<{ pattern: RegExp; boost: number }> = [
  { pattern: /critical|fatal|crash|unhandled|injection|brute.?force/i, boost: 20 },
  { pattern: /error|fail|exception|breach|violation/i, boost: 10 },
  { pattern: /warn|slow|stall|drift|gap/i, boost: 5 },
  { pattern: /high.?sever|sev.?1|p0|p1/i, boost: 15 },
  { pattern: /expired|non.?compliant/i, boost: 12 },
];

const BLAST_RADIUS_SIGNALS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /all.?clients|platform.?wide|global/i, score: 100 },
  { pattern: /multiple.?clients|tenant.?wide/i, score: 80 },
  { pattern: /auth|login|jwt|session/i, score: 75 },
  { pattern: /database|schema|migration/i, score: 70 },
  { pattern: /api|endpoint|route/i, score: 60 },
  { pattern: /frontend|react|ui|crash/i, score: 50 },
  { pattern: /single.?client|one.?user/i, score: 30 },
];

export function classifyThreat(
  domain: string,
  title: string,
  description: string,
  overrideSeverity?: number
): ThreatClassification {
  const base = DOMAIN_SEVERITY_BASE[domain] ?? 60;
  const text = `${title} ${description}`;

  let severityBoost = 0;
  for (const { pattern, boost } of SEVERITY_KEYWORDS) {
    if (pattern.test(text)) severityBoost += boost;
  }

  const severity = overrideSeverity ?? Math.min(100, base + severityBoost);

  let blastRadius = 40;
  for (const { pattern, score } of BLAST_RADIUS_SIGNALS) {
    if (pattern.test(text)) {
      blastRadius = Math.max(blastRadius, score);
    }
  }

  return { domain, severity, blastRadius };
}

export function computeErrorFingerprint(domain: string, title: string, component?: string): string {
  const raw = `${domain}:${title.toLowerCase().replace(/\s+/g, "_")}:${component ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
