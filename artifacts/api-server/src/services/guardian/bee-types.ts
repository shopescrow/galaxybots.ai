export type BeeType =
  | "debug"
  | "security"
  | "ai_safety"
  | "client_health"
  | "performance"
  | "data_integrity"
  | "compliance"
  | "dependency"
  | "prediction";

export interface ThreatBrief {
  domain: string;
  title: string;
  description: string;
  severity: number;
  affectedComponent?: string;
  sourcePayload?: unknown;
  incidentId: number;
  mcpContext?: string;
}

export interface BeeFinding {
  beeType: BeeType;
  finding: string;
  rootCause: string;
  proposedFix: string;
  confidenceScore: number;
  severity?: number;
}

export const DOMAIN_TO_BEES: Record<string, BeeType[]> = {
  code: ["debug"],
  security: ["security"],
  ai_safety: ["ai_safety"],
  client_health: ["client_health", "prediction"],
  performance: ["performance"],
  data_integrity: ["data_integrity"],
  compliance: ["compliance"],
  dependency: ["dependency"],
  predictive: ["prediction"],
  aeo: ["client_health", "prediction"],
  piratemonster: ["client_health", "security"],
  webhook_auth: ["debug", "security"],
};

export function getBeesForDomain(domain: string): BeeType[] {
  return DOMAIN_TO_BEES[domain] ?? ["debug"];
}
