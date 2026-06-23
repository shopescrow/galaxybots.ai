import {
  db,
  clientsTable,
  botBeliefsTable,
  causalOutcomesTable,
  opportunitySignalsTable,
  botsTable,
  botAssignmentsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, gte, ne } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createNotification } from "../../admin/notifications";
import { broadcastSSE } from "../sse";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastOpportunityRun = 0;

interface DetectedOpportunity {
  signalType: "engagement_drop" | "churn_precursor" | "upsell_trigger" | "re_engagement" | "optimization";
  title: string;
  description: string;
  suggestedAction: string;
  probabilityOfSuccess: number;
  evidenceChain: string[];
  predictedOutcome: {
    best: number;
    median: number;
    worst: number;
    confidence: number;
  };
}

async function detectOpportunitiesForClient(
  clientId: number,
  botId: number,
): Promise<DetectedOpportunity[]> {
  const [beliefs, causalPatterns] = await Promise.all([
    db
      .select()
      .from(botBeliefsTable)
      .where(
        and(
          eq(botBeliefsTable.clientId, clientId),
          isNull(botBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(botBeliefsTable.updatedAt))
      .limit(15),

    db
      .select()
      .from(causalOutcomesTable)
      .where(eq(causalOutcomesTable.clientId, clientId))
      .orderBy(desc(causalOutcomesTable.attributionConfidence))
      .limit(10),
  ]);

  if (beliefs.length === 0) return [];

  const beliefSummary = beliefs
    .map((b) => `- [conf: ${b.confidence.toFixed(2)}] ${b.beliefText}`)
    .join("\n");

  const causalSummary = causalPatterns
    .filter((c) => c.causalPatternSummary)
    .map((c) => `- ${c.causalPatternSummary} (treatment effect: ${(c.treatmentEffect ?? 0).toFixed(2)}, confidence: ${(c.attributionConfidence ?? 0).toFixed(2)})`)
    .join("\n");

  const prompt = `Analyze this client's current state and identify proactive opportunities.

## Client Belief State
${beliefSummary}

## Causal History (control-adjusted)
${causalSummary || "No causal patterns recorded yet."}

Identify 0-3 proactive opportunities. Look for: engagement drops, churn precursors, upsell signals, or optimization windows.

For each opportunity, estimate probability based on causal evidence.

Respond with JSON array:
[
  {
    "signalType": "engagement_drop|churn_precursor|upsell_trigger|re_engagement|optimization",
    "title": "Short opportunity title",
    "description": "What the data shows and why this matters",
    "suggestedAction": "Specific recommended action",
    "probabilityOfSuccess": 0.0-1.0,
    "evidenceChain": ["key evidence 1", "key evidence 2"],
    "predictedOutcome": {
      "best": number,
      "median": number,
      "worst": number,
      "confidence": 0.0-1.0
    }
  }
]

Return [] if no clear opportunities exist. Only flag genuine signals with evidence support.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content: "You detect proactive opportunities for AI agents from belief state and causal patterns. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const opportunities: DetectedOpportunity[] = Array.isArray(parsed)
      ? parsed
      : (parsed.opportunities ?? []);
    return opportunities.slice(0, 3);
  } catch {
    return [];
  }
}

export async function runOpportunityDetection() {
  const now = Date.now();
  if (now - lastOpportunityRun < ONE_WEEK_MS) return;
  lastOpportunityRun = now;

  console.log("[opportunity] Running weekly opportunity detection...");

  const clients = await db.select({ id: clientsTable.id }).from(clientsTable).limit(100);

  for (const client of clients) {
    try {
      const [botAssignment] = await db
        .select({ botId: botAssignmentsTable.botId })
        .from(botAssignmentsTable)
        .where(eq(botAssignmentsTable.clientId, client.id))
        .limit(1);

      const botId = botAssignment?.botId;
      if (!botId) continue;

      const opportunities = await detectOpportunitiesForClient(client.id, botId);

      for (const opp of opportunities) {
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const [signal] = await db
          .insert(opportunitySignalsTable)
          .values({
            clientId: client.id,
            botId,
            signalType: opp.signalType,
            title: opp.title,
            description: opp.description,
            suggestedAction: opp.suggestedAction,
            probabilityOfSuccess: opp.probabilityOfSuccess,
            evidenceChain: opp.evidenceChain,
            predictedOutcomeDistribution: opp.predictedOutcome,
            status: "pending",
            expiresAt,
          })
          .returning();

        const pct = Math.round(opp.probabilityOfSuccess * 100);
        createNotification({
          clientId: client.id,
          category: "bot",
          severity: opp.signalType === "churn_precursor" ? "critical" : "warning",
          title: `Opportunity detected: ${opp.title}`,
          body: `Based on causal history (control-adjusted): ${opp.suggestedAction} has a ${pct}% probability of success. Approve?`,
          link: "/command-center",
          metadata: { signalId: signal.id, signalType: opp.signalType, probabilityOfSuccess: opp.probabilityOfSuccess },
          isScheduled: true,
        }).catch(() => {});

        broadcastSSE("opportunity-detected", {
          clientId: client.id,
          signalId: signal.id,
          signalType: opp.signalType,
          title: opp.title,
          probabilityOfSuccess: opp.probabilityOfSuccess,
        });

        console.log(
          `[opportunity] Detected for client ${client.id}: ${opp.signalType} — "${opp.title}" (${pct}% probability)`,
        );
      }
    } catch (err) {
      console.error(`[opportunity] Error for client ${client.id}:`, err);
    }
  }

  console.log("[opportunity] Weekly opportunity detection complete.");
}
