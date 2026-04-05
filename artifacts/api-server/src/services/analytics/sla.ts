import { db, botSlaEventsTable, botSlaOverridesTable, slaTiersTable, clientsTable } from "@workspace/db";
import { eq, and, isNull, lt, sql } from "drizzle-orm";
import { createNotification } from "../admin/notifications";
import { broadcastSSE } from "../platform/scheduler";

const SLA_TIER_MAP: Record<string, string> = {
  free: "standard",
  starter: "standard",
  standard: "standard",
  team: "priority",
  priority: "priority",
  enterprise: "enterprise",
};

async function getClientTier(clientId: number): Promise<string> {
  const [client] = await db
    .select({ plan: clientsTable.plan })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  const plan = client?.plan ?? "standard";
  return SLA_TIER_MAP[plan] ?? "standard";
}

async function getTierTargets(tierId: string): Promise<{ responseTargetMs: number; completionTargetMinutes: number; escalationChannels: string[] }> {
  const [tier] = await db
    .select()
    .from(slaTiersTable)
    .where(eq(slaTiersTable.tierId, tierId));
  if (!tier) {
    return { responseTargetMs: 90000, completionTargetMinutes: 240, escalationChannels: ["notification"] };
  }
  return {
    responseTargetMs: tier.responseTargetMs,
    completionTargetMinutes: tier.completionTargetMinutes,
    escalationChannels: (tier.escalationChannels ?? []) as string[],
  };
}

async function getBotSlaOverride(botId: number, clientId: number): Promise<{ responseTargetMs: number | null; completionTargetMinutes: number | null } | null> {
  const [override] = await db
    .select()
    .from(botSlaOverridesTable)
    .where(and(eq(botSlaOverridesTable.botId, botId), eq(botSlaOverridesTable.clientId, clientId)));
  return override ?? null;
}

export async function recordSlaDirective(params: {
  botId: number;
  clientId: number;
  sessionId?: number;
}): Promise<number | null> {
  try {
    const tier = await getClientTier(params.clientId);
    const targets = await getTierTargets(tier);
    const override = await getBotSlaOverride(params.botId, params.clientId);
    const targetMs = override?.responseTargetMs ?? targets.responseTargetMs;

    const [event] = await db
      .insert(botSlaEventsTable)
      .values({
        botId: params.botId,
        clientId: params.clientId,
        sessionId: params.sessionId ?? null,
        eventType: "response",
        directedAt: new Date(),
        targetMs,
        tier,
        approvalHoldMs: 0,
        breached: false,
      })
      .returning({ id: botSlaEventsTable.id });

    return event?.id ?? null;
  } catch (err) {
    console.error("[sla] Failed to record SLA directive:", err);
    return null;
  }
}

export async function resolveSlaResponse(params: {
  slaEventId: number;
  approvalHoldMs?: number;
}): Promise<void> {
  try {
    const [event] = await db
      .select()
      .from(botSlaEventsTable)
      .where(eq(botSlaEventsTable.id, params.slaEventId));
    if (!event) return;

    const resolvedAt = new Date();
    const durationMs = resolvedAt.getTime() - new Date(event.directedAt).getTime();
    const holdMs = params.approvalHoldMs ?? event.approvalHoldMs ?? 0;
    const netDurationMs = Math.max(0, durationMs - holdMs);
    const breached = netDurationMs > event.targetMs;

    await db
      .update(botSlaEventsTable)
      .set({
        resolvedAt,
        durationMs,
        approvalHoldMs: holdMs,
        netDurationMs,
        breached,
      })
      .where(eq(botSlaEventsTable.id, params.slaEventId));
  } catch (err) {
    console.error("[sla] Failed to resolve SLA response:", err);
  }
}

export async function recordSlaCompletion(params: {
  botId: number;
  clientId: number;
  sessionId: number;
  durationMinutes: number;
  approvalHoldMs?: number;
}): Promise<void> {
  try {
    const tier = await getClientTier(params.clientId);
    const targets = await getTierTargets(tier);
    const override = await getBotSlaOverride(params.botId, params.clientId);
    const targetMinutes = override?.completionTargetMinutes ?? targets.completionTargetMinutes;
    const targetMs = targetMinutes * 60 * 1000;
    const durationMs = Math.round(params.durationMinutes * 60 * 1000);
    const holdMs = params.approvalHoldMs ?? 0;
    const netDurationMs = Math.max(0, durationMs - holdMs);
    const breached = netDurationMs > targetMs;

    await db.insert(botSlaEventsTable).values({
      botId: params.botId,
      clientId: params.clientId,
      sessionId: params.sessionId,
      eventType: "completion",
      directedAt: new Date(Date.now() - durationMs),
      resolvedAt: new Date(),
      durationMs,
      approvalHoldMs: holdMs,
      netDurationMs,
      targetMs,
      breached,
      tier,
    });
  } catch (err) {
    console.error("[sla] Failed to record SLA completion:", err);
  }
}

export async function checkSlaBreaches(): Promise<void> {
  try {
    const now = new Date();

    const openEvents = await db
      .select()
      .from(botSlaEventsTable)
      .where(
        and(
          isNull(botSlaEventsTable.resolvedAt),
          eq(botSlaEventsTable.breached, false),
          isNull(botSlaEventsTable.breachNotifiedAt)
        )
      );

    for (const event of openEvents) {
      const elapsed = now.getTime() - new Date(event.directedAt).getTime();
      const holdMs = event.approvalHoldMs ?? 0;
      const netElapsed = Math.max(0, elapsed - holdMs);

      if (netElapsed > event.targetMs) {
        await db
          .update(botSlaEventsTable)
          .set({ breached: true, breachNotifiedAt: now })
          .where(eq(botSlaEventsTable.id, event.id));

        createNotification({
          clientId: event.clientId,
          category: "bot",
          severity: "critical",
          title: "SLA Breach Detected",
          body: `Bot #${event.botId} exceeded the ${event.eventType === "response" ? "response" : "task completion"} SLA target (${Math.round(event.targetMs / 1000)}s). Elapsed: ${Math.round(netElapsed / 1000)}s.`,
          link: `/bots/${event.botId}`,
          metadata: { slaEventId: event.id, botId: event.botId, tier: event.tier },
          isScheduled: true,
        }).catch((e) => console.error("[sla] Failed to create breach notification:", e));

        broadcastSSE("sla_breach", {
          clientId: event.clientId,
          botId: event.botId,
          slaEventId: event.id,
          eventType: event.eventType,
          tier: event.tier,
          targetMs: event.targetMs,
          elapsedMs: netElapsed,
        });
      }
    }
  } catch (err) {
    console.error("[sla] checkSlaBreaches error:", err);
  }
}

export async function getEffectiveSlaTargets(botId: number, clientId: number): Promise<{
  responseTargetMs: number;
  completionTargetMinutes: number;
  tier: string;
  hasOverride: boolean;
}> {
  const tier = await getClientTier(clientId);
  const targets = await getTierTargets(tier);
  const override = await getBotSlaOverride(botId, clientId);

  return {
    responseTargetMs: override?.responseTargetMs ?? targets.responseTargetMs,
    completionTargetMinutes: override?.completionTargetMinutes ?? targets.completionTargetMinutes,
    tier,
    hasOverride: !!override,
  };
}
