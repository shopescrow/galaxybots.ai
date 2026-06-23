import {
  db,
  promptVersionsTable,
  botsTable,
  botFailureLogTable,
  sessionOutcomesTable,
  taskSessionBotsTable,
} from "@workspace/db";
import { eq, desc, lt, and, isNotNull, gte, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastPromptEvolutionRun = 0;

const SMALL_DIFF_THRESHOLD = 0.05;

type FailurePattern = {
  category: string;
  count: number;
  exampleDetails: string[];
  toolsAttempted: string[];
};

function analyzeFailurePatterns(
  failures: Array<{
    failureCategory: string;
    failureDetail: string;
    toolsAttempted: string[] | null;
    lastThought: string | null;
  }>,
  outcomes: Array<{
    terminationReason: string | null;
    failureCategory: string | null;
  }>,
): FailurePattern[] {
  const patternMap = new Map<string, FailurePattern>();

  for (const f of failures) {
    const key = f.failureCategory || "unknown";
    if (!patternMap.has(key)) {
      patternMap.set(key, { category: key, count: 0, exampleDetails: [], toolsAttempted: [] });
    }
    const p = patternMap.get(key)!;
    p.count++;
    if (f.failureDetail && p.exampleDetails.length < 3) {
      p.exampleDetails.push(f.failureDetail.slice(0, 200));
    }
    for (const t of f.toolsAttempted ?? []) {
      if (!p.toolsAttempted.includes(t)) p.toolsAttempted.push(t);
    }
  }

  for (const o of outcomes) {
    if (!o.failureCategory && !o.terminationReason) continue;
    const key = o.failureCategory ?? o.terminationReason ?? "unknown";
    if (!patternMap.has(key)) {
      patternMap.set(key, { category: key, count: 0, exampleDetails: [], toolsAttempted: [] });
    }
    patternMap.get(key)!.count++;
  }

  return Array.from(patternMap.values())
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count);
}

function generateEvidenceBasedDiff(
  currentPrompt: string,
  patterns: FailurePattern[],
  botName: string | null,
): { newPrompt: string; evidenceSummary: string; diff: string } | null {
  if (patterns.length === 0) return null;

  const topPattern = patterns[0];
  const additions: string[] = [];
  const evidenceParts: string[] = [];

  if (topPattern.category === "quality_gate_failed" || topPattern.category === "iteration_cap") {
    additions.push(
      `\n[Auto-evolved constraint]: When you reach 70% of your iteration budget, proactively consolidate your findings and produce a partial answer rather than continuing to search for a perfect response. This prevents ${topPattern.count} observed quality-gate failures.`,
    );
    evidenceParts.push(
      `Quality gate / iteration cap failures: ${topPattern.count} occurrences. Pattern detected in low-scoring sessions.`,
    );
  } else if (topPattern.category === "tool_failure") {
    const failingTools = topPattern.toolsAttempted.slice(0, 3).join(", ");
    additions.push(
      `\n[Auto-evolved fallback]: If tool calls to [${failingTools || "external APIs"}] fail, acknowledge the limitation and provide the best available answer from your context rather than retrying indefinitely. Observed ${topPattern.count} tool-failure terminations.`,
    );
    evidenceParts.push(
      `Tool failures: ${topPattern.count} occurrences. Affected tools: ${failingTools || "multiple"}.`,
    );
  } else if (topPattern.category === "timeout") {
    additions.push(
      `\n[Auto-evolved time-awareness]: Monitor task complexity early. If the task requires more than 3 sequential tool calls, summarize progress at each step and flag if a full answer is unlikely within budget. Mitigates ${topPattern.count} timeout terminations.`,
    );
    evidenceParts.push(`Timeout failures: ${topPattern.count} occurrences.`);
  } else if (topPattern.category === "context_window_exceeded") {
    additions.push(
      `\n[Auto-evolved context management]: Prefer concise tool outputs. When referencing prior results, summarize rather than repeating verbatim. This prevents context-window exhaustion (${topPattern.count} occurrences).`,
    );
    evidenceParts.push(`Context window overflows: ${topPattern.count} occurrences.`);
  } else {
    additions.push(
      `\n[Auto-evolved guidance]: When encountering "${topPattern.category}" conditions (observed ${topPattern.count} times), provide a partial answer with clear caveats rather than failing silently.`,
    );
    evidenceParts.push(`Pattern "${topPattern.category}": ${topPattern.count} occurrences.`);
  }

  if (patterns.length > 1) {
    const secondary = patterns.slice(1, 3).map((p) => `${p.category}(×${p.count})`).join(", ");
    evidenceParts.push(`Secondary patterns: ${secondary}.`);
  }

  const newPrompt = currentPrompt + additions.join("");
  const diff = additions.map((a) => `+ ${a.trim()}`).join("\n");
  const evidenceSummary = `[Week ${new Date().toISOString().slice(0, 10)}] Evidence-driven evolution for ${botName ?? "bot"}: ${evidenceParts.join(" ")}`;

  return { newPrompt, evidenceSummary, diff };
}

function diffMagnitude(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = b.split(/\s+/);
  let changed = 0;
  for (const w of wordsB) {
    if (!wordsA.has(w)) changed++;
  }
  return changed / Math.max(wordsA.size + wordsB.length, 1);
}

export async function runPromptEvolution() {
  const now = Date.now();
  if (now - lastPromptEvolutionRun < ONE_WEEK_MS) return;
  lastPromptEvolutionRun = now;

  console.log("[prompt-evolution] Running weekly evidence-driven prompt evolution...");

  const bots = await db
    .select({ id: botsTable.id, declaration: botsTable.declaration, name: botsTable.name })
    .from(botsTable);

  const since = new Date(now - 30 * 24 * 60 * 60 * 1000);

  for (const bot of bots) {
    try {
      const activeVersion = await db
        .select()
        .from(promptVersionsTable)
        .where(
          and(
            eq(promptVersionsTable.botId, bot.id),
            eq(promptVersionsTable.status, "active"),
          ),
        )
        .orderBy(desc(promptVersionsTable.versionNum))
        .limit(1);

      const currentPrompt =
        activeVersion[0]?.promptText ?? bot.declaration ?? "You are a helpful AI assistant.";
      const currentVersionNum = activeVersion[0]?.versionNum ?? 0;

      const shadowPending = await db
        .select({ id: promptVersionsTable.id })
        .from(promptVersionsTable)
        .where(
          and(
            eq(promptVersionsTable.botId, bot.id),
            eq(promptVersionsTable.status, "shadow"),
          ),
        )
        .limit(1);

      if (shadowPending.length > 0) {
        console.log(`[prompt-evolution] Bot ${bot.id}: shadow version pending, skipping`);
        continue;
      }

      // Step 1: Query per-bot failure log (already bot-scoped)
      const failures = await db
        .select({
          failureCategory: botFailureLogTable.failureCategory,
          failureDetail: botFailureLogTable.failureDetail,
          toolsAttempted: botFailureLogTable.toolsAttempted,
          lastThought: botFailureLogTable.lastThought,
        })
        .from(botFailureLogTable)
        .where(
          and(
            eq(botFailureLogTable.botId, bot.id),
            gte(botFailureLogTable.createdAt, since),
          ),
        )
        .orderBy(desc(botFailureLogTable.createdAt))
        .limit(100);

      // Step 2: Query per-bot session outcomes by joining through task_session_bots
      // (session_outcomes does not have a direct bot_id column — join via taskSessionBotsTable
      // to find sessions this bot participated in)
      const botSessionIds = await db
        .select({ sessionId: taskSessionBotsTable.sessionId })
        .from(taskSessionBotsTable)
        .where(
          and(
            eq(taskSessionBotsTable.botId, bot.id),
            gte(taskSessionBotsTable.addedAt, since),
          ),
        )
        .limit(500);

      const sessionIds = botSessionIds.map((r) => r.sessionId);

      const failedOutcomes =
        sessionIds.length > 0
          ? await db
              .select({
                terminationReason: sessionOutcomesTable.terminationReason,
                failureCategory: sessionOutcomesTable.failureCategory,
              })
              .from(sessionOutcomesTable)
              .where(
                and(
                  inArray(sessionOutcomesTable.sessionId, sessionIds),
                  isNotNull(sessionOutcomesTable.failureCategory),
                ),
              )
              .limit(200)
          : [];

      const patterns = analyzeFailurePatterns(
        failures.map((f) => ({
          failureCategory: f.failureCategory,
          failureDetail: f.failureDetail,
          toolsAttempted: f.toolsAttempted as string[] | null,
          lastThought: f.lastThought,
        })),
        failedOutcomes.map((o) => ({
          terminationReason: o.terminationReason,
          failureCategory: o.failureCategory,
        })),
      );

      if (patterns.length === 0) {
        console.log(`[prompt-evolution] Bot ${bot.id}: no actionable failure patterns found`);
        continue;
      }

      const result = generateEvidenceBasedDiff(currentPrompt, patterns, bot.name);
      if (!result) {
        console.log(`[prompt-evolution] Bot ${bot.id}: could not generate evidence-based diff`);
        continue;
      }

      const { newPrompt, evidenceSummary, diff } = result;
      const magnitude = diffMagnitude(currentPrompt, newPrompt);

      if (magnitude < 0.001) {
        console.log(`[prompt-evolution] Bot ${bot.id}: diff too small, skipping`);
        continue;
      }

      const shadowPeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const status = magnitude < SMALL_DIFF_THRESHOLD ? "shadow" : "pending_review";

      await db.insert(promptVersionsTable).values({
        botId: bot.id,
        versionNum: currentVersionNum + 1,
        promptText: newPrompt,
        diffFromPrev: diff,
        evidenceSummary,
        triggeredBy: "calibration_pipeline",
        shadowPeriodEnd,
        diffMagnitudePct: magnitude,
        status,
        shadowSuccesses: 0,
        shadowSampleN: 0,
        outcomeScoreBefore:
          failures.length > 0
            ? 1 - failures.length / Math.max(failures.length + 10, 1)
            : 0.8,
      });

      console.log(
        `[prompt-evolution] Bot ${bot.id}: queued v${currentVersionNum + 1} (${status}, magnitude=${(magnitude * 100).toFixed(1)}%, patterns=${patterns.length})`,
      );
    } catch (err) {
      console.error(`[prompt-evolution] Error for bot ${bot.id}:`, err);
    }
  }

  console.log("[prompt-evolution] Weekly evidence-driven prompt evolution complete.");
}

/**
 * Rational approximation of the standard normal CDF (Abramowitz & Stegun 26.2.17).
 * Does NOT rely on Math.erf (not available in Node.js/V8).
 */
function normalCDF(z: number): number {
  const absZ = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989423 * Math.exp(-0.5 * absZ * absZ);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.7814779 + t * (-1.8212559 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Computes a two-proportion z-test comparing the shadow cohort success rate against the
 * control (active prompt) baseline, then promotes or rolls back based on significance.
 *
 * Gate: promote only if p >= 0.05 (no significant degradation) OR if the shadow version
 * is significantly BETTER (p < 0.05 and shadow rate > control rate).
 * Roll back if shadow is significantly WORSE (p < 0.05 and shadow rate < control rate).
 */
function twoProportionZTest(
  shadowSuccesses: number,
  shadowN: number,
  controlRate: number,
): { z: number; p: number } {
  if (shadowN < 5) return { z: 0, p: 1 };

  const shadowRate = shadowSuccesses / shadowN;
  const pooledP = (shadowSuccesses + controlRate * shadowN) / (shadowN * 2);
  const se = Math.sqrt(2 * (pooledP * (1 - pooledP)) / shadowN);
  if (se === 0) return { z: 0, p: 1 };

  const z = (shadowRate - controlRate) / se;
  // Two-tailed p-value using normal CDF approximation (no Math.erf dependency)
  const p = 2 * normalCDF(-Math.abs(z));
  const clippedP = Math.max(0.001, Math.min(1, isNaN(p) ? 1 : p));
  return { z: parseFloat(z.toFixed(4)), p: clippedP };
}

export async function runPromptShadowPromotion() {
  const now = new Date();

  const shadowVersions = await db
    .select()
    .from(promptVersionsTable)
    .where(
      and(
        eq(promptVersionsTable.status, "shadow"),
        lt(promptVersionsTable.shadowPeriodEnd, now),
      ),
    );

  for (const version of shadowVersions) {
    try {
      const shadowN = version.shadowSampleN ?? 0;
      const shadowSuccesses = version.shadowSuccesses ?? 0;

      // Prefer concurrent control cohort over static baseline.
      // controlSampleN is the live control arm measured during the same shadow period.
      const controlN = (version as any).controlSampleN ?? 0;
      const controlSuccesses = (version as any).controlSuccesses ?? 0;
      const concurrentControlRate =
        controlN >= 5 ? controlSuccesses / controlN : (version.outcomeScoreBefore ?? 0.8);
      const controlRate = concurrentControlRate;

      let shouldRollBack = false;
      let promotionNote: string;

      const shadowRate = shadowN > 0 ? shadowSuccesses / shadowN : controlRate;

      // Practical safety gate (applies at any sample size):
      // auto-rollback if shadow success rate drops more than 10% relative to CONCURRENT control.
      const practicalDrop = controlRate > 0 ? (shadowRate - controlRate) / controlRate : 0;
      const controlNote = controlN >= 5
        ? `concurrent control n=${controlN} (${(controlRate * 100).toFixed(1)}%)`
        : `static baseline (${(controlRate * 100).toFixed(1)}%)`;

      if (shadowN >= 3 && practicalDrop < -0.1) {
        shouldRollBack = true;
        promotionNote = `Practical rollback: shadow ${(shadowRate * 100).toFixed(1)}% is ${(Math.abs(practicalDrop) * 100).toFixed(1)}% below ${controlNote} (shadow n=${shadowN})`;
      } else if (shadowN >= 5) {
        // Apply full statistical gate: two-proportion z-test at p < 0.05
        const { z, p } = twoProportionZTest(shadowSuccesses, shadowN, controlRate);

        if (p < 0.05 && shadowRate < controlRate) {
          shouldRollBack = true;
          promotionNote = `Statistical rollback: shadow ${(shadowRate * 100).toFixed(1)}% < ${controlNote} (z=${z}, p=${p.toFixed(3)}, n=${shadowN})`;
        } else if (p < 0.05 && shadowRate > controlRate) {
          promotionNote = `Promoted: shadow significantly better — ${(shadowRate * 100).toFixed(1)}% vs ${controlNote} (z=${z}, p=${p.toFixed(3)}, n=${shadowN})`;
        } else {
          promotionNote = `Promoted: no significant degradation after ${shadowN} shadow sessions vs ${controlNote} (z=${z}, p=${p.toFixed(3)})`;
        }
      } else {
        // Insufficient sample for z-test — check EMA fallback
        const scoreAfter = version.outcomeScoreAfter;
        if (scoreAfter !== null && scoreAfter !== undefined && controlRate > 0) {
          const emaDrop = (scoreAfter - controlRate) / controlRate;
          if (emaDrop < -0.1) {
            shouldRollBack = true;
            promotionNote = `EMA rollback: score dropped ${(Math.abs(emaDrop) * 100).toFixed(1)}% vs ${controlNote} (shadow n=${shadowN} < 5)`;
          } else {
            promotionNote = `Promoted via EMA (shadow n=${shadowN} < 5, no statistical test)`;
          }
        } else {
          promotionNote = `Promoted: insufficient shadow data (n=${shadowN}), no degradation signal`;
        }
      }

      if (shouldRollBack) {
        await db
          .update(promptVersionsTable)
          .set({
            status: "rolled_back",
            rollbackReason: promotionNote,
          })
          .where(eq(promptVersionsTable.id, version.id));
        console.log(`[prompt-shadow] v${version.versionNum} bot ${version.botId}: ${promotionNote}`);
      } else {
        // IMPORTANT: archive existing active versions FIRST (before promoting the shadow candidate).
        // The candidate is still "shadow" at this point, so the archive WHERE clause
        // (status = "active") will NOT accidentally include it.
        await db
          .update(promptVersionsTable)
          .set({ deactivatedAt: now, status: "archived" })
          .where(
            and(
              eq(promptVersionsTable.botId, version.botId),
              eq(promptVersionsTable.status, "active"),
            ),
          );

        // Now promote the candidate from shadow → active
        await db
          .update(promptVersionsTable)
          .set({ status: "active", activatedAt: now })
          .where(eq(promptVersionsTable.id, version.id));

        console.log(`[prompt-shadow] v${version.versionNum} bot ${version.botId}: ${promotionNote}`);
      }
    } catch (err) {
      console.error(`[prompt-shadow] Error promoting version ${version.id}:`, err);
    }
  }
}

/**
 * Resolves the effective system prompt for a bot, applying shadow-version traffic splitting.
 * 20% of calls (determined by a stable hash of the conversationId/sessionId) receive the
 * shadow prompt; the remaining 80% receive the active prompt. The promptVersionId is returned
 * so callers can tag confidence predictions with which variant was served.
 */
export async function resolvePromptWithShadowSplit(opts: {
  botId: number;
  fallbackPrompt: string;
  conversationId?: number;
  sessionId?: number;
}): Promise<{ prompt: string; promptVersionId: number | null; isShadow: boolean }> {
  try {
    const [shadowVersion] = await db
      .select()
      .from(promptVersionsTable)
      .where(
        and(
          eq(promptVersionsTable.botId, opts.botId),
          eq(promptVersionsTable.status, "shadow"),
        ),
      )
      .orderBy(desc(promptVersionsTable.versionNum))
      .limit(1);

    if (!shadowVersion) {
      // No shadow version — serve active version if available
      const [activeVersion] = await db
        .select()
        .from(promptVersionsTable)
        .where(
          and(
            eq(promptVersionsTable.botId, opts.botId),
            eq(promptVersionsTable.status, "active"),
          ),
        )
        .orderBy(desc(promptVersionsTable.versionNum))
        .limit(1);

      return {
        prompt: activeVersion?.promptText ?? opts.fallbackPrompt,
        promptVersionId: activeVersion?.id ?? null,
        isShadow: false,
      };
    }

    // Deterministic 20% assignment based on conversation/session identity.
    // Multiply by large prime to spread buckets evenly.
    const seed = opts.conversationId ?? opts.sessionId ?? Math.random() * 1e9;
    const bucket = Math.floor((seed * 2654435761) % 100);
    const inShadow = bucket < 20;

    if (inShadow) {
      return {
        prompt: shadowVersion.promptText,
        promptVersionId: shadowVersion.id,  // shadow candidate id — outcome counted as shadow arm
        isShadow: true,
      };
    }

    // Serve active version text, but attribute the outcome to the SHADOW CANDIDATE id
    // so that concurrent control cohort stats accumulate on the same shadow version row
    // that stores shadow cohort stats. This enables apples-to-apples comparison at
    // promotion time without reading a separate active version row.
    const [activeVersion] = await db
      .select()
      .from(promptVersionsTable)
      .where(
        and(
          eq(promptVersionsTable.botId, opts.botId),
          eq(promptVersionsTable.status, "active"),
        ),
      )
      .orderBy(desc(promptVersionsTable.versionNum))
      .limit(1);

    return {
      prompt: activeVersion?.promptText ?? opts.fallbackPrompt,
      promptVersionId: shadowVersion.id,   // always shadow candidate id for outcome accounting
      isShadow: false,
    };
  } catch (err) {
    console.error("[resolvePromptWithShadowSplit] Error:", err);
    return { prompt: opts.fallbackPrompt, promptVersionId: null, isShadow: false };
  }
}

/**
 * Records the outcome of a session that ran during a shadow period.
 *
 * `isShadow=true`  → session received the candidate prompt (shadow arm).
 * `isShadow=false` → session received the active prompt (control arm).
 *
 * Both arms are tracked concurrently so the promotion gate compares the
 * shadow success rate against a LIVE control cohort, not a stale baseline.
 */
export async function recordShadowOutcome(opts: {
  promptVersionId: number;
  succeeded: boolean;
  isShadow: boolean;
}): Promise<void> {
  try {
    const [version] = await db
      .select({
        id: promptVersionsTable.id,
        outcomeScoreAfter: promptVersionsTable.outcomeScoreAfter,
        shadowSuccesses: promptVersionsTable.shadowSuccesses,
        shadowSampleN: promptVersionsTable.shadowSampleN,
        controlSuccesses: (promptVersionsTable as any).controlSuccesses,
        controlSampleN: (promptVersionsTable as any).controlSampleN,
      })
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.id, opts.promptVersionId))
      .limit(1);

    if (!version) return;

    if (opts.isShadow) {
      const newN = (version.shadowSampleN ?? 0) + 1;
      const newSuccesses = (version.shadowSuccesses ?? 0) + (opts.succeeded ? 1 : 0);
      const prevEma = version.outcomeScoreAfter ?? 0.8;
      const newEma = 0.8 * prevEma + 0.2 * (opts.succeeded ? 1.0 : 0.0);
      await db
        .update(promptVersionsTable)
        .set({
          shadowSampleN: newN,
          shadowSuccesses: newSuccesses,
          outcomeScoreAfter: newEma,
        })
        .where(eq(promptVersionsTable.id, version.id));
    } else {
      // Control arm — track concurrent baseline for accurate A/B comparison
      const newControlN = ((version.controlSampleN as number | null) ?? 0) + 1;
      const newControlSuccesses = ((version.controlSuccesses as number | null) ?? 0) + (opts.succeeded ? 1 : 0);
      await db
        .update(promptVersionsTable)
        .set({
          controlSampleN: newControlN as any,
          controlSuccesses: newControlSuccesses as any,
        })
        .where(eq(promptVersionsTable.id, version.id));
    }
  } catch (err) {
    console.error("[recordShadowOutcome] Error:", err);
  }
}
