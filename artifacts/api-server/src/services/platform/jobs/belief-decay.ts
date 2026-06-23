import { db, botBeliefsTable } from "@workspace/db";
import { isNull, eq, and, not } from "drizzle-orm";
import { Confidence, CONFIDENCE_FLOOR } from "../../../agent-core/value-objects/index.js";
import type { BeliefCategory } from "../../../agent-core/value-objects/index.js";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runBeliefDecay(): Promise<void> {
  const now = new Date();

  try {
    const beliefs = await db
      .select({
        id: botBeliefsTable.id,
        confidence: botBeliefsTable.confidence,
        lastConfirmedAt: botBeliefsTable.lastConfirmedAt,
        halfLifeDays: botBeliefsTable.halfLifeDays,
        category: botBeliefsTable.category,
      })
      .from(botBeliefsTable)
      .where(
        and(
          isNull(botBeliefsTable.archivedAt),
          not(eq(botBeliefsTable.immutable, true)),
        ),
      );

    let decayed = 0;

    for (const belief of beliefs) {
      const daysElapsed = (now.getTime() - belief.lastConfirmedAt.getTime()) / MS_PER_DAY;
      if (daysElapsed < 1) continue;

      const current = Confidence.of(Number(belief.confidence));
      const updated = current.decayForCategory(belief.category as BeliefCategory, daysElapsed);

      if (Math.abs(updated.value - current.value) < 0.001) continue;

      const newConfidence = Math.max(CONFIDENCE_FLOOR, updated.value);

      await db
        .update(botBeliefsTable)
        .set({ confidence: newConfidence, updatedAt: now })
        .where(eq(botBeliefsTable.id, belief.id));

      decayed++;
    }

    console.log(`[belief-decay] Decayed ${decayed} of ${beliefs.length} beliefs`);
  } catch (err) {
    console.error("[belief-decay] error:", errMsg(err));
  }
}

export async function checkBeliefDecay(): Promise<void> {
  if (new Date().getUTCDay() !== 0) return;
  await runBeliefDecay();
}
