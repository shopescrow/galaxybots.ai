/**
 * Role Specialization Engine — weekly job.
 *
 * A/B framework for bot role variants:
 * - Creates challenger variants for underperforming roles
 * - Sessions deterministically assigned to A or B via stable hash of sessionId
 *   (same session always maps to same variant across weekly evaluations)
 * - Weekly Welch t-test on per-variant binary success scores from real variant-labeled sessions
 * - Tracks consecutive weeks of statistically significant outperformance
 * - On 4 consecutive weeks of significance → declares champion, retires loser config
 */

import {
  db,
  botVariantAssignmentsTable,
  sessionOutcomesTable,
  taskSessionsTable,
  taskSessionBotsTable,
  botsTable,
  promptVersionsTable,
} from "@workspace/db";
import { eq, and, gte, inArray, sql, desc } from "drizzle-orm";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
let lastSpecializationRun = 0;

const SIGNIFICANCE_THRESHOLD = 0.05;
const WEEKS_TO_CHAMPION = 4;
const MIN_SAMPLES_PER_VARIANT = 5;

function welchTTest(
  meanA: number,
  meanB: number,
  varA: number,
  varB: number,
  nA: number,
  nB: number,
): { t: number; p: number } {
  if (nA < MIN_SAMPLES_PER_VARIANT || nB < MIN_SAMPLES_PER_VARIANT) return { t: 0, p: 1 };
  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return { t: 0, p: 1 };
  const t = Math.abs((meanA - meanB) / se);
  const p = Math.exp(-0.717 * t - 0.416 * t * t);
  return { t: parseFloat(t.toFixed(4)), p: Math.max(0.001, Math.min(1, p)) };
}

/**
 * Deterministically assign a session to variant A or B using a stable hash.
 * weightA is the fraction of traffic routed to A (e.g. 0.8 → 80% to A).
 * Same sessionId always maps to the same variant — reproducible across weekly evaluations.
 */
function sessionVariant(sessionId: number, weightA: number): "A" | "B" {
  const hash = ((sessionId * 2654435761) >>> 0) % 10000;
  return hash < Math.round(weightA * 10000) ? "A" : "B";
}

export async function runRoleSpecializationEngine() {
  const now = Date.now();
  if (now - lastSpecializationRun < SEVEN_DAYS_MS) return;
  lastSpecializationRun = now;

  console.log("[role-specialization] Running weekly role specialization engine...");

  const since = new Date(now - 7 * 24 * 60 * 60 * 1000);

  try {
    const activeVariants = await db
      .select()
      .from(botVariantAssignmentsTable)
      .where(eq(botVariantAssignmentsTable.status, "active"));

    for (const variant of activeVariants) {
      try {
        const weightA = variant.assignmentWeightA ?? 0.8;

        // Step 1: Find bots whose title matches the variant's botRole
        const matchingBots = await db
          .select({ id: botsTable.id })
          .from(botsTable)
          .where(eq(botsTable.title, variant.botRole))
          .limit(200);

        const botIds = matchingBots.map((b) => b.id);
        if (botIds.length === 0) {
          console.log(
            `[role-specialization] No bots found for role "${variant.botRole}" — skipping`,
          );
          continue;
        }

        // Step 2: Find task sessions for these bots via task_session_bots join table
        const sessionBotRows = await db
          .select({ sessionId: taskSessionBotsTable.sessionId })
          .from(taskSessionBotsTable)
          .where(inArray(taskSessionBotsTable.botId, botIds))
          .limit(5000);

        const candidateSessionIds = [...new Set(sessionBotRows.map((r) => r.sessionId))];
        if (candidateSessionIds.length === 0) {
          console.log(
            `[role-specialization] Variant ${variant.id} (${variant.botRole}): no sessions found via join`,
          );
          continue;
        }

        // Filter to sessions created in the last 7 days
        const sessions = await db
          .select({ id: taskSessionsTable.id })
          .from(taskSessionsTable)
          .where(
            and(
              inArray(taskSessionsTable.id, candidateSessionIds),
              gte(taskSessionsTable.createdAt, since),
            ),
          )
          .limit(2000);

        const sessionIds = sessions.map((s) => s.id);
        if (sessionIds.length < MIN_SAMPLES_PER_VARIANT * 2) {
          console.log(
            `[role-specialization] Variant ${variant.id} (${variant.botRole}): ` +
              `insufficient sessions (${sessionIds.length} < ${MIN_SAMPLES_PER_VARIANT * 2})`,
          );
          continue;
        }

        // Step 3: Fetch outcomes for these sessions
        const outcomes = await db
          .select({
            sessionId: sessionOutcomesTable.sessionId,
            failureCategory: sessionOutcomesTable.failureCategory,
            // Read the variant label that was stored at session execution time.
            // Falls back to hash-based assignment when label is absent (older sessions).
            storedVariantLabel: sql<string | null>`${sessionOutcomesTable.loopTrace}->>'roleVariantLabel'`,
          })
          .from(sessionOutcomesTable)
          .where(inArray(sessionOutcomesTable.sessionId, sessionIds));

        // Step 4: Use STORED variant labels where available; fall back to hash for older sessions.
        const groupA: number[] = [];
        const groupB: number[] = [];

        for (const o of outcomes) {
          const label =
            (o.storedVariantLabel as "A" | "B" | null) ?? sessionVariant(o.sessionId, weightA);
          const score = o.failureCategory === null ? 1.0 : 0.0;
          if (label === "A") groupA.push(score);
          else groupB.push(score);
        }

        const nA = groupA.length;
        const nB = groupB.length;

        if (nA < MIN_SAMPLES_PER_VARIANT || nB < MIN_SAMPLES_PER_VARIANT) {
          console.log(
            `[role-specialization] Variant ${variant.id} (${variant.botRole}): ` +
              `insufficient per-variant samples (nA=${nA}, nB=${nB})`,
          );
          continue;
        }

        const meanA = groupA.reduce((a, b) => a + b, 0) / nA;
        const meanB = groupB.reduce((a, b) => a + b, 0) / nB;

        const varA =
          nA > 1
            ? groupA.reduce((acc, v) => acc + Math.pow(v - meanA, 2), 0) / (nA - 1)
            : Math.max(0.01, meanA * (1 - meanA));
        const varB =
          nB > 1
            ? groupB.reduce((acc, v) => acc + Math.pow(v - meanB, 2), 0) / (nB - 1)
            : Math.max(0.01, meanB * (1 - meanB));

        const { t, p } = welchTTest(meanA, meanB, varA, varB, nA, nB);
        const isSignificant = p < SIGNIFICANCE_THRESHOLD;
        const performanceDelta = meanB - meanA;

        // Track which variant is currently winning.
        // A positive performanceDelta means B beats A; negative means A beats B.
        // Reset the streak when the winner changes — only consecutive wins by the
        // same variant count toward promotion. This allows EITHER A OR B to win.
        const prevDelta = variant.performanceDelta ?? 0;
        const lastWinnerWasB = prevDelta > 0;
        const thisWinnerIsB = performanceDelta > 0;
        const prevStreak = variant.weeksOfSignificance ?? 0;

        const newWeeksOfSignificance = isSignificant
          ? prevStreak > 0 && lastWinnerWasB === thisWinnerIsB
            ? prevStreak + 1   // same side winning: extend streak
            : 1                // new winner or first significant week: start fresh
          : 0;                 // not significant: reset

        // Champion is whichever variant has the higher outcome mean this week
        const championVariant = performanceDelta > 0 ? "B" : "A";

        const shouldDeclareChampion = newWeeksOfSignificance >= WEEKS_TO_CHAMPION;

        if (shouldDeclareChampion) {
          const retiredConfigId =
            championVariant === "B"
              ? variant.variantAConfigId
              : variant.variantBConfigId;

          await db
            .update(botVariantAssignmentsTable)
            .set({
              status: "champion_declared",
              championDeclaredAt: new Date(),
              championVariant,
              retiredConfigId: retiredConfigId ?? null,
              retiredAt: new Date(),
              weeksOfSignificance: newWeeksOfSignificance,
              performanceDelta,
              lastTTestPValue: p,
              lastTTestStatistic: t,
              sampleSizeA: nA,
              sampleSizeB: nB,
              meanOutcomeA: meanA,
              meanOutcomeB: meanB,
              assignmentWeightA: championVariant === "A" ? 1.0 : 0.0,
              assignmentWeightB: championVariant === "B" ? 1.0 : 0.0,
              updatedAt: new Date(),
            })
            .where(eq(botVariantAssignmentsTable.id, variant.id));

          // Deactivate the losing config in prompt_versions (not just assignment metadata).
          // This ensures the retired variant can no longer be served to new sessions and
          // surfaces in prompt version analytics as rolled back.
          if (retiredConfigId) {
            await db
              .update(promptVersionsTable)
              .set({
                status: "rolled_back",
                rollbackReason: `Champion declared for role "${variant.botRole}": variant ${championVariant} wins with delta=${performanceDelta.toFixed(3)}, p=${p.toFixed(3)}. This variant retired.`,
                deactivatedAt: new Date(),
              })
              .where(eq(promptVersionsTable.id, retiredConfigId));

            console.log(
              `[role-specialization] Retired loser config #${retiredConfigId} for role "${variant.botRole}".`,
            );
          }

          console.log(
            `[role-specialization] ✓ Champion declared for role "${variant.botRole}": ` +
              `variant ${championVariant} wins (meanA=${meanA.toFixed(3)}, meanB=${meanB.toFixed(3)}, p=${p.toFixed(3)})`,
          );
        } else {
          await db
            .update(botVariantAssignmentsTable)
            .set({
              weeksOfSignificance: newWeeksOfSignificance,
              performanceDelta,
              lastTTestPValue: p,
              lastTTestStatistic: t,
              sampleSizeA: nA,
              sampleSizeB: nB,
              meanOutcomeA: meanA,
              meanOutcomeB: meanB,
              updatedAt: new Date(),
            })
            .where(eq(botVariantAssignmentsTable.id, variant.id));

          console.log(
            `[role-specialization] Variant ${variant.id} (${variant.botRole}): ` +
              `weeks_sig=${newWeeksOfSignificance}, delta=${performanceDelta.toFixed(3)}, p=${p.toFixed(3)} (nA=${nA}, nB=${nB})`,
          );
        }
      } catch (err) {
        console.error(`[role-specialization] Error processing variant ${variant.id}:`, err);
      }
    }

    console.log(`[role-specialization] Processed ${activeVariants.length} active variants.`);

    // ── Challenger Creation ────────────────────────────────────────────────────
    // Find bot roles with consistently low success rates that don't yet have an
    // active A/B experiment. Create challenger variant assignments for them so the
    // engine will evaluate them next cycle.
    //
    // Criteria: role has ≥ MIN_SAMPLES_PER_VARIANT * 2 sessions in last 7 days
    // AND role-level success rate < 50%
    // AND no existing active or champion_declared variant assignment.
    await createChallengerVariants(since);

  } catch (err) {
    console.error("[role-specialization] Fatal error:", err);
  }
}

/**
 * Identify underperforming bot roles with no active A/B experiment and create
 * challenger variant assignments for them so the next weekly cycle can evaluate
 * whether a different configuration produces better outcomes.
 */
async function createChallengerVariants(since: Date): Promise<void> {
  try {
    // Find existing active/declared roles to skip (dedup)
    const existingAssignments = await db
      .select({ botRole: botVariantAssignmentsTable.botRole })
      .from(botVariantAssignmentsTable)
      .where(
        sql`${botVariantAssignmentsTable.status} IN ('active', 'champion_declared')`,
      );
    const coveredRoles = new Set(existingAssignments.map((a) => a.botRole));

    // Find bot roles with low success rates (using bots → sessions → outcomes join)
    const roleStats = await db
      .select({
        botRole: botsTable.title,
        total: sql<number>`COUNT(DISTINCT ${sessionOutcomesTable.sessionId})`,
        failed: sql<number>`COUNT(DISTINCT ${sessionOutcomesTable.sessionId}) FILTER (WHERE ${sessionOutcomesTable.failureCategory} IS NOT NULL)`,
      })
      .from(botsTable)
      .innerJoin(taskSessionBotsTable, eq(taskSessionBotsTable.botId, botsTable.id))
      .innerJoin(taskSessionsTable, eq(taskSessionsTable.id, taskSessionBotsTable.sessionId))
      .innerJoin(sessionOutcomesTable, eq(sessionOutcomesTable.sessionId, taskSessionsTable.id))
      .where(gte(taskSessionsTable.createdAt, since))
      .groupBy(botsTable.title)
      .having(sql`COUNT(DISTINCT ${sessionOutcomesTable.sessionId}) >= ${MIN_SAMPLES_PER_VARIANT * 2}`)
      .limit(20);

    let challengers = 0;
    for (const row of roleStats) {
      if (!row.botRole || coveredRoles.has(row.botRole)) continue;
      const total = Number(row.total);
      const failed = Number(row.failed);
      if (total === 0) continue;
      const successRate = (total - failed) / total;
      if (successRate >= 0.5) continue; // Only create challenger for underperformers

      // Find the bot to attach the prompt version to
      const [bot] = await db
        .select({ id: botsTable.id, description: botsTable.description, personality: botsTable.personality })
        .from(botsTable)
        .where(eq(botsTable.title, row.botRole))
        .limit(1);

      if (!bot) continue;

      // Get current highest-version active prompt for this bot (fallback: system prompt)
      const [existingVersion] = await db
        .select({
          id: promptVersionsTable.id,
          promptText: promptVersionsTable.promptText,
          versionNum: promptVersionsTable.versionNum,
        })
        .from(promptVersionsTable)
        .where(
          and(eq(promptVersionsTable.botId, bot.id), eq(promptVersionsTable.status, "active")),
        )
        .orderBy(desc(promptVersionsTable.versionNum))
        .limit(1);

      const baseText =
        existingVersion?.promptText ??
        (bot.description
          ? `You are a ${row.botRole}. ${bot.description} Personality: ${bot.personality}`
          : `You are a ${row.botRole} bot.`);
      const baseVersionNum = existingVersion?.versionNum ?? 0;

      // Create a challenger prompt variant cloned from the current config with
      // a directive that nudges toward more concise, proactive tool use.
      // This gives variant B a genuinely different configuration to test.
      const challengerText =
        baseText +
        `\n\n[Challenger variant — auto-generated by Role Specialization Engine]\n` +
        `Optimization directive: Prefer concise, structured responses. ` +
        `Use tools proactively when the action is unambiguous. ` +
        `Minimize clarification steps unless human judgment is explicitly required. ` +
        `Prioritize first-attempt success over exhaustive confirmation cycles.`;

      const [challengerVersion] = await db
        .insert(promptVersionsTable)
        .values({
          botId: bot.id,
          versionNum: baseVersionNum + 1,
          promptText: challengerText,
          triggeredBy: "role_specialization_engine",
          evidenceSummary: `Auto-generated challenger for role "${row.botRole}": ` +
            `${(successRate * 100).toFixed(0)}% success rate over ${total} sessions. ` +
            `Shadow A/B test over 4 weeks.`,
          diffFromPrev: "Challenger: added concise/proactive tool-use directive.",
          status: "shadow",
          shadowPeriodEnd: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
        })
        .returning({ id: promptVersionsTable.id });

      if (!challengerVersion) continue;

      // Create variant assignment: 80% to A (control config), 20% to B (challenger prompt).
      // variantAConfigId is explicitly set so that on champion declaration, the loser
      // (whichever of A or B) can be deterministically retired via prompt_versions update.
      await db.insert(botVariantAssignmentsTable).values({
        botRole: row.botRole,
        variantAConfigId: existingVersion?.id ?? null,   // current active config = control arm
        variantBConfigId: challengerVersion.id,           // new challenger config = treatment arm
        assignmentWeightA: 0.8,
        assignmentWeightB: 0.2,
        weeksOfSignificance: 0,
        sampleSizeA: 0,
        sampleSizeB: 0,
        status: "active",
      });

      challengers++;
      console.log(
        `[role-specialization] Created challenger for role "${row.botRole}" ` +
          `(prompt_version #${challengerVersion.id}, success=${(successRate * 100).toFixed(0)}%, n=${total})`,
      );
    }

    if (challengers > 0) {
      console.log(`[role-specialization] Created ${challengers} challenger variant assignment(s).`);
    }
  } catch (err) {
    console.error("[role-specialization] Error during challenger creation:", err);
  }
}
