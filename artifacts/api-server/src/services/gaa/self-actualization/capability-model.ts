import {
  db,
  botCapabilityModelTable,
  type BotCapabilityModel,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Per-bot, per-task-category capability self-model. This is the agent's belief
// about its own competence, updated from residualized outcome quality on every
// completed session. It is queryable by the coordinator (to bias role
// selection) and surfaced in the console.
//
// competence : EWMA of outcome quality (0..1)
// confidence : grows with sample size, penalised by volatility (0..1)
// trend      : short EWMA minus long EWMA (signed slope)
// ---------------------------------------------------------------------------

const SHORT_ALPHA = 0.35; // fast EWMA — recent performance
const LONG_ALPHA = 0.1; // slow EWMA — established baseline
const VOL_ALPHA = 0.2; // volatility EWMA
const CONFIDENCE_FULL_N = 20; // samples at which sample-size confidence saturates

export type CapabilitySignal = {
  competence: number;
  confidence: number;
  trend: number;
  sampleCount: number;
  strengthTier: string;
};

const NEUTRAL_SIGNAL: CapabilitySignal = {
  competence: 0.5,
  confidence: 0,
  trend: 0,
  sampleCount: 0,
  strengthTier: "unproven",
};

function deriveStrengthTier(
  competence: number,
  confidence: number,
  sampleCount: number,
): string {
  if (sampleCount < 3 || confidence < 0.15) return "unproven";
  if (competence >= 0.8) return "strong";
  if (competence >= 0.65) return "competent";
  if (competence >= 0.45) return "developing";
  return "weak";
}

/**
 * Update the capability self-model for a bot/category from one outcome.
 * `quality` is the residualized (preferred) or raw outcome quality in 0..1.
 * Cheap and side-effect-light — safe to call from the coordinator outcome path.
 */
export async function updateCapabilityFromOutcome(params: {
  botId: number;
  taskCategory: string;
  quality: number;
  clientId?: number | null;
}): Promise<void> {
  const quality = Math.max(0, Math.min(1, params.quality));
  const clientId = params.clientId ?? null;

  try {
    const clientFilter =
      clientId != null
        ? eq(botCapabilityModelTable.clientId, clientId)
        : sql`${botCapabilityModelTable.clientId} IS NULL`;

    const [existing] = await db
      .select()
      .from(botCapabilityModelTable)
      .where(
        and(
          eq(botCapabilityModelTable.botId, params.botId),
          eq(botCapabilityModelTable.taskCategory, params.taskCategory),
          clientFilter,
        ),
      )
      .limit(1);

    if (!existing) {
      const confidence = sampleConfidence(1, 0);
      await db.insert(botCapabilityModelTable).values({
        botId: params.botId,
        clientId,
        taskCategory: params.taskCategory,
        competence: quality,
        confidence,
        trend: 0,
        sampleCount: 1,
        shortEwma: quality,
        longEwma: quality,
        volatility: 0,
        lastQuality: quality,
        strengthTier: deriveStrengthTier(quality, confidence, 1),
        lastUpdated: new Date(),
      });
      return;
    }

    const shortEwma = SHORT_ALPHA * quality + (1 - SHORT_ALPHA) * existing.shortEwma;
    const longEwma = LONG_ALPHA * quality + (1 - LONG_ALPHA) * existing.longEwma;
    const surprise = Math.abs(quality - existing.competence);
    const volatility = VOL_ALPHA * surprise + (1 - VOL_ALPHA) * existing.volatility;
    const sampleCount = existing.sampleCount + 1;
    // Competence tracks the slow EWMA so single bad runs don't crater it.
    const competence = longEwma;
    const trend = shortEwma - longEwma;
    const confidence = sampleConfidence(sampleCount, volatility);

    await db
      .update(botCapabilityModelTable)
      .set({
        competence,
        confidence,
        trend,
        sampleCount,
        shortEwma,
        longEwma,
        volatility,
        lastQuality: quality,
        strengthTier: deriveStrengthTier(competence, confidence, sampleCount),
        lastUpdated: new Date(),
      })
      .where(eq(botCapabilityModelTable.id, existing.id));
  } catch (err) {
    // Never let self-model bookkeeping break the outcome path.
    console.warn("[self-actualization] capability update failed:", err);
  }
}

function sampleConfidence(sampleCount: number, volatility: number): number {
  const sizeConf = Math.min(1, sampleCount / CONFIDENCE_FULL_N);
  const stability = Math.max(0, 1 - volatility);
  return Math.max(0, Math.min(1, sizeConf * stability));
}

/**
 * Capability signal for the coordinator. Prefers client-scoped knowledge, then
 * platform-scoped, then a neutral prior. Always resolves — never throws.
 */
export async function getCapabilitySignal(
  botId: number,
  taskCategory: string,
  clientId?: number | null,
): Promise<CapabilitySignal> {
  try {
    if (clientId != null) {
      const [scoped] = await db
        .select()
        .from(botCapabilityModelTable)
        .where(
          and(
            eq(botCapabilityModelTable.botId, botId),
            eq(botCapabilityModelTable.taskCategory, taskCategory),
            eq(botCapabilityModelTable.clientId, clientId),
          ),
        )
        .limit(1);
      if (scoped && scoped.sampleCount >= 3) return toSignal(scoped);
    }

    const [platform] = await db
      .select()
      .from(botCapabilityModelTable)
      .where(
        and(
          eq(botCapabilityModelTable.botId, botId),
          eq(botCapabilityModelTable.taskCategory, taskCategory),
          sql`${botCapabilityModelTable.clientId} IS NULL`,
        ),
      )
      .limit(1);
    if (platform) return toSignal(platform);
  } catch (err) {
    console.warn("[self-actualization] capability read failed:", err);
  }
  return { ...NEUTRAL_SIGNAL };
}

/**
 * Bounded multiplicative nudge the coordinator applies to a bot's effective
 * weight. Confident strong capability nudges up, confident weak nudges down.
 * Bounded to ±`maxNudge` and neutral (1.0) when there is no evidence.
 */
export function capabilityNudgeFactor(
  signal: CapabilitySignal,
  maxNudge = 0.08,
): number {
  if (signal.confidence <= 0 || signal.sampleCount < 3) return 1.0;
  // Centre competence at 0.5; scale by confidence and a small trend boost.
  const centred = signal.competence - 0.5; // -0.5..0.5
  const trendBoost = Math.max(-0.1, Math.min(0.1, signal.trend));
  const raw = (centred * 2 + trendBoost) * signal.confidence; // ~ -1..1
  const bounded = Math.max(-1, Math.min(1, raw));
  return 1 + bounded * maxNudge;
}

function toSignal(row: BotCapabilityModel): CapabilitySignal {
  return {
    competence: row.competence,
    confidence: row.confidence,
    trend: row.trend,
    sampleCount: row.sampleCount,
    strengthTier: row.strengthTier,
  };
}

/** Full capability model for a bot, ordered by competence. */
export async function getBotCapabilitySummary(
  botId: number,
): Promise<BotCapabilityModel[]> {
  return db
    .select()
    .from(botCapabilityModelTable)
    .where(eq(botCapabilityModelTable.botId, botId))
    .orderBy(desc(botCapabilityModelTable.competence));
}

/**
 * Weakest categories for a bot with enough evidence to act on — the targets of
 * the practice loop and the recipients of knowledge transfer.
 */
export async function getWeakestCategories(
  botId: number,
  opts: { minSamples?: number; limit?: number } = {},
): Promise<BotCapabilityModel[]> {
  const minSamples = opts.minSamples ?? 3;
  const rows = await db
    .select()
    .from(botCapabilityModelTable)
    .where(eq(botCapabilityModelTable.botId, botId))
    .orderBy(botCapabilityModelTable.competence);
  return rows
    .filter((r) => r.sampleCount >= minSamples && r.competence < 0.65)
    .slice(0, opts.limit ?? 3);
}

/** Strongest (bot, category) pairs platform-wide — the donors for distillation. */
export async function getStrongestCapabilities(opts: {
  taskCategory?: string;
  minCompetence?: number;
  minConfidence?: number;
  limit?: number;
}): Promise<BotCapabilityModel[]> {
  const minCompetence = opts.minCompetence ?? 0.7;
  const minConfidence = opts.minConfidence ?? 0.4;
  const conditions = [
    sql`${botCapabilityModelTable.competence} >= ${minCompetence}`,
    sql`${botCapabilityModelTable.confidence} >= ${minConfidence}`,
  ];
  if (opts.taskCategory) {
    conditions.push(eq(botCapabilityModelTable.taskCategory, opts.taskCategory));
  }
  return db
    .select()
    .from(botCapabilityModelTable)
    .where(and(...conditions))
    .orderBy(desc(botCapabilityModelTable.competence))
    .limit(opts.limit ?? 10);
}
