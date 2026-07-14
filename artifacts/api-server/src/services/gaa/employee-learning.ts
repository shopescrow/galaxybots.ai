import {
  db,
  employeeBehavioralProfilesTable,
  employeeLearningEventsTable,
  orgBehavioralBaselinesTable,
  taskSessionMessagesTable,
  botCapabilityModelTable,
  usersTable,
  type EmployeeBehavioralProfile,
  type OrgBehavioralBaseline,
} from "@workspace/db";
import { eq, and, desc, gte, sql, lt } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";

const MIN_CONFIDENCE_FOR_INJECTION = 0.2;
const SESSION_WEIGHT = 0.3;
const HISTORY_WEIGHT = 0.7;

export type LearningSignalType =
  | "correction"
  | "approval"
  | "reprompt"
  | "escalation"
  | "explicit_feedback"
  | "session_end_reflection"
  | "profile_flag";

export async function emitLearningSignal(params: {
  userId: number;
  botId: number;
  clientId: number;
  taskSessionId: number;
  eventType: LearningSignalType;
  signalData: Record<string, unknown>;
  confidenceContribution?: number;
}): Promise<void> {
  try {
    await db.insert(employeeLearningEventsTable).values({
      userId: params.userId,
      botId: params.botId,
      clientId: params.clientId,
      taskSessionId: params.taskSessionId,
      eventType: params.eventType,
      signalData: params.signalData,
      learnedDelta: {},
      confidenceContribution: params.confidenceContribution ?? 0.05,
    });
  } catch (err) {
    console.warn("[employee-learning] signal emit failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

export async function detectAndEmitMessageSignals(params: {
  sessionId: number;
  userId: number;
  clientId: number;
  botIds: number[];
  humanContent: string;
  priorBotMessages: Array<{ content: string; botId: number | null }>;
}): Promise<void> {
  const { sessionId, userId, clientId, botIds, humanContent, priorBotMessages } = params;
  if (botIds.length === 0) return;

  const lower = humanContent.toLowerCase().trim();

  const approvalPatterns = [
    /^(great|perfect|thanks|thank you|yes|exactly|correct|good|nice|ok|okay|sounds good|looks good|got it|understood|proceed|done|approved)/i,
  ];
  const repromptPatterns = [
    /^(try again|redo|rephrase|that's not|you misunderstood|not what i asked|i meant|what i actually need|can you redo|please redo)/i,
  ];

  const escalationPatterns = [
    /\b(escalate|urgent|critical|asap|human|manager|supervisor|need help from|talk to a person)\b/i,
  ];

  const isApproval = approvalPatterns.some((p) => p.test(lower)) && lower.length < 120;
  const isReprompt = repromptPatterns.some((p) => p.test(lower));
  const isEscalation = escalationPatterns.some((p) => p.test(lower));

  let isCorrectionLikely = false;
  if (priorBotMessages.length > 0 && !isApproval && !isReprompt && !isEscalation && humanContent.length > 40) {
    const lastBot = priorBotMessages[priorBotMessages.length - 1];
    const editDistance = roughEditDistance(lastBot.content, humanContent);
    if (editDistance < 0.6) {
      isCorrectionLikely = true;
    }
  }

  if (!isApproval && !isReprompt && !isCorrectionLikely && !isEscalation) {
    return;
  }

  const eventType: LearningSignalType = isEscalation
    ? "escalation"
    : isApproval
    ? "approval"
    : isReprompt
    ? "reprompt"
    : "correction";

  const contribution = isEscalation ? 0.07 : isApproval ? 0.08 : isReprompt ? 0.05 : 0.06;

  for (const botId of botIds) {
    await emitLearningSignal({
      userId,
      botId,
      clientId,
      taskSessionId: sessionId,
      eventType,
      signalData: {
        humanMessageLength: humanContent.length,
        priorBotMessageCount: priorBotMessages.length,
        isApproval,
        isReprompt,
        isCorrectionLikely,
        isEscalation,
      },
      confidenceContribution: contribution,
    }).catch(() => {});
  }
}

export async function emitExplicitFeedback(params: {
  userId: number;
  botId: number;
  clientId: number;
  taskSessionId: number;
  rating: number;
  comment?: string;
}): Promise<void> {
  const { userId, botId, clientId, taskSessionId, rating, comment } = params;
  const normalizedRating = Math.max(0, Math.min(1, (rating - 1) / 4));
  await emitLearningSignal({
    userId,
    botId,
    clientId,
    taskSessionId,
    eventType: "explicit_feedback",
    signalData: { rating, normalizedRating, comment: comment ?? "" },
    confidenceContribution: 0.15,
  });
}

function roughEditDistance(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).slice(0, 50));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).slice(0, 50));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function runEmployeeProfileUpdate(params: {
  sessionId: number;
  userId: number;
  botId: number;
  clientId: number;
}): Promise<void> {
  const { sessionId, userId, botId, clientId } = params;

  if (sessionId > 0) {
    const alreadyProcessed = await db
      .select({ id: employeeLearningEventsTable.id })
      .from(employeeLearningEventsTable)
      .where(
        and(
          eq(employeeLearningEventsTable.userId, userId),
          eq(employeeLearningEventsTable.botId, botId),
          eq(employeeLearningEventsTable.taskSessionId, sessionId),
          eq(employeeLearningEventsTable.eventType, "session_end_reflection"),
        ),
      )
      .limit(1);
    if (alreadyProcessed.length > 0) return;
  }

  const events = await db
    .select()
    .from(employeeLearningEventsTable)
    .where(
      and(
        eq(employeeLearningEventsTable.userId, userId),
        eq(employeeLearningEventsTable.botId, botId),
        eq(employeeLearningEventsTable.taskSessionId, sessionId),
      ),
    );

  const recentMessages = sessionId > 0
    ? await db
        .select()
        .from(taskSessionMessagesTable)
        .where(eq(taskSessionMessagesTable.sessionId, sessionId))
        .orderBy(desc(taskSessionMessagesTable.createdAt))
        .limit(10)
    : [];

  if (recentMessages.length === 0 && events.length === 0) return;

  const transcript = recentMessages
    .reverse()
    .map((m) => `[${m.role === "bot" ? m.botName || "Agent" : "Employee"}]: ${m.content}`)
    .join("\n");

  const [existing] = await db
    .select()
    .from(employeeBehavioralProfilesTable)
    .where(
      and(
        eq(employeeBehavioralProfilesTable.userId, userId),
        eq(employeeBehavioralProfilesTable.botId, botId),
      ),
    );

  const sessionCount = (existing?.sessionCount ?? 0) + 1;
  const sessionWeight = Math.min(SESSION_WEIGHT, 1 / sessionCount);
  const historyWeight = 1 - sessionWeight;

  const approvals = events.filter((e) => e.eventType === "approval").length;
  const corrections = events.filter((e) => e.eventType === "correction").length;
  const reprompts = events.filter((e) => e.eventType === "reprompt").length;
  const total = Math.max(1, approvals + corrections + reprompts);
  const sessionApprovalRate = approvals / total;

  const existingTrust = existing?.trustCalibration ?? 0.5;
  const newTrust = existingTrust * historyWeight + sessionApprovalRate * sessionWeight;

  let extractionResult: {
    communicationStyle: { formality: number; verbosity: number; structurePreference: "narrative" | "bullets" | "tables" | "mixed" };
    expertiseSignals: string[];
    recurringConcerns: string[];
    vocabularyTerms: string[];
    formatPreferences: Record<string, unknown>;
    profileSummary: string;
  } | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      max_completion_tokens: 600,
      messages: [
        {
          role: "system",
          content: `You analyze an employee-agent conversation to build a behavioral profile. Return JSON only.
Fields:
- communicationStyle: { formality: 0-1, verbosity: 0-1, structurePreference: "narrative"|"bullets"|"tables"|"mixed" }
- expertiseSignals: string[] (domain areas where employee shows knowledge, max 5)
- recurringConcerns: string[] (topics the employee consistently raises, max 5)
- vocabularyTerms: string[] (specific terms the employee uses, max 8)
- formatPreferences: object (any output format signals observed)
- profileSummary: string (1-2 sentences, plain language, describing how the agent should adapt)`,
        },
        {
          role: "user",
          content: `Transcript (last 20 messages):\n${transcript.slice(0, 3000)}\n\nSignal summary: ${approvals} approvals, ${corrections} corrections, ${reprompts} reprompts out of ${total} interactions.`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    extractionResult = JSON.parse(raw);
  } catch (err) {
    console.warn("[employee-learning] LLM extraction failed:", err instanceof Error ? err.message : err);
  }

  if (!extractionResult) return;

  const mergeArray = (existing: string[], incoming: string[], weight: number): string[] => {
    const combined = [...new Set([...existing, ...incoming])];
    return combined.slice(0, 10);
  };

  const mergeStyle = (
    existing: { formality: number; verbosity: number; structurePreference: string } | undefined,
    incoming: { formality: number; verbosity: number; structurePreference: string },
    sessionW: number,
    histW: number,
  ) => ({
    formality: (existing?.formality ?? 0.5) * histW + (incoming.formality ?? 0.5) * sessionW,
    verbosity: (existing?.verbosity ?? 0.5) * histW + (incoming.verbosity ?? 0.5) * sessionW,
    structurePreference: incoming.structurePreference ?? existing?.structurePreference ?? "mixed",
  });

  const newStyle = mergeStyle(
    existing?.communicationStyle as { formality: number; verbosity: number; structurePreference: string } | undefined,
    extractionResult.communicationStyle,
    sessionWeight,
    historyWeight,
  );

  const newExpertise = mergeArray(
    (existing?.expertiseSignals as string[]) ?? [],
    extractionResult.expertiseSignals ?? [],
    sessionWeight,
  );
  const newConcerns = mergeArray(
    (existing?.recurringConcerns as string[]) ?? [],
    extractionResult.recurringConcerns ?? [],
    sessionWeight,
  );
  const newVocab = mergeArray(
    (existing?.vocabularyTerms as string[]) ?? [],
    extractionResult.vocabularyTerms ?? [],
    sessionWeight,
  );

  const rawConfidence = events.reduce((s, e) => s + e.confidenceContribution, 0);
  const newConfidence = Math.min(1, (existing?.confidenceScore ?? 0) * 0.8 + rawConfidence * 0.2);

  const profileValues = {
    userId,
    botId,
    clientId,
    communicationStyle: newStyle as { formality: number; verbosity: number; structurePreference: "narrative" | "bullets" | "tables" | "mixed" },
    formatPreferences: extractionResult.formatPreferences ?? {},
    expertiseSignals: newExpertise,
    recurringConcerns: newConcerns,
    trustCalibration: newTrust,
    vocabularyTerms: newVocab,
    profileSummary: extractionResult.profileSummary,
    confidenceScore: newConfidence,
    sessionCount,
    lastUpdatedAt: new Date(),
  };

  const learnedDelta = {
    trustDelta: newTrust - (existing?.trustCalibration ?? 0.5),
    confidenceDelta: newConfidence - (existing?.confidenceScore ?? 0),
    sessionCount,
    signalBreakdown: { approvals, corrections, reprompts },
  };

  await db
    .insert(employeeBehavioralProfilesTable)
    .values(profileValues)
    .onConflictDoUpdate({
      target: [employeeBehavioralProfilesTable.userId, employeeBehavioralProfilesTable.botId],
      set: {
        communicationStyle: sql`excluded.communication_style`,
        formatPreferences: sql`excluded.format_preferences`,
        expertiseSignals: sql`excluded.expertise_signals`,
        recurringConcerns: sql`excluded.recurring_concerns`,
        trustCalibration: sql`excluded.trust_calibration`,
        vocabularyTerms: sql`excluded.vocabulary_terms`,
        profileSummary: sql`excluded.profile_summary`,
        confidenceScore: sql`excluded.confidence_score`,
        sessionCount: sql`excluded.session_count`,
        lastUpdatedAt: sql`excluded.last_updated_at`,
      },
    });

  await db.insert(employeeLearningEventsTable).values({
    userId,
    botId,
    clientId,
    taskSessionId: sessionId,
    eventType: "session_end_reflection",
    signalData: { approvals, corrections, reprompts, sessionCount },
    learnedDelta,
    confidenceContribution: rawConfidence,
  });

  await feedTrustToCapabilityModel(userId, botId, clientId, newTrust, corrections, approvals).catch(() => {});
}

const REFRESH_THROTTLE_MS = 60 * 60 * 1000;

export async function refreshEmployeeProfileFromEvents(params: {
  userId: number;
  botId: number;
  clientId: number;
}): Promise<void> {
  const { userId, botId, clientId } = params;

  const [existing] = await db
    .select()
    .from(employeeBehavioralProfilesTable)
    .where(
      and(
        eq(employeeBehavioralProfilesTable.userId, userId),
        eq(employeeBehavioralProfilesTable.botId, botId),
      ),
    );

  if (existing) {
    const msSinceUpdate = Date.now() - new Date(existing.lastUpdatedAt).getTime();
    if (msSinceUpdate < REFRESH_THROTTLE_MS) return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(employeeLearningEventsTable)
    .where(
      and(
        eq(employeeLearningEventsTable.userId, userId),
        eq(employeeLearningEventsTable.botId, botId),
        gte(employeeLearningEventsTable.createdAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(employeeLearningEventsTable.createdAt))
    .limit(50);

  if (events.length === 0) return;

  const approvals = events.filter((e) => e.eventType === "approval").length;
  const corrections = events.filter((e) => e.eventType === "correction").length;
  const reprompts = events.filter((e) => e.eventType === "reprompt").length;
  const escalations = events.filter((e) => e.eventType === "escalation").length;
  const explicitFeedback = events.filter((e) => e.eventType === "explicit_feedback");
  const total = Math.max(1, approvals + corrections + reprompts);

  const avgExplicit = explicitFeedback.length > 0
    ? explicitFeedback.reduce((s, e) => s + ((e.signalData as { normalizedRating?: number } | null)?.normalizedRating ?? 0.5), 0) / explicitFeedback.length
    : null;

  const baseApprovalRate = approvals / total;
  const trustSignal = avgExplicit !== null ? (baseApprovalRate + avgExplicit) / 2 : baseApprovalRate;
  const existingTrust = existing?.trustCalibration ?? 0.5;
  const newTrust = existingTrust * 0.8 + trustSignal * 0.2;

  const existingSummary = existing?.profileSummary ?? "";
  let extractionResult: {
    communicationStyle: { formality: number; verbosity: number; structurePreference: "narrative" | "bullets" | "tables" | "mixed" };
    expertiseSignals: string[];
    recurringConcerns: string[];
    vocabularyTerms: string[];
    formatPreferences: Record<string, unknown>;
    profileSummary: string;
  } | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: `You refine an employee behavioral profile from interaction signals. Return JSON only.
Fields:
- communicationStyle: { formality: 0-1, verbosity: 0-1, structurePreference: "narrative"|"bullets"|"tables"|"mixed" }
- expertiseSignals: string[] (max 5)
- recurringConcerns: string[] (max 5)
- vocabularyTerms: string[] (max 8)
- formatPreferences: object
- profileSummary: string (1-2 sentences)`,
        },
        {
          role: "user",
          content: `Existing profile summary: ${existingSummary || "none yet"}\n\nRecent signal summary (last 30 days): ${approvals} approvals, ${corrections} corrections, ${reprompts} reprompts, ${escalations} escalations, ${explicitFeedback.length} explicit ratings${avgExplicit !== null ? ` (avg ${(avgExplicit * 5).toFixed(1)}/5)` : ""}.\n\nRefine or initialize the profile based on these signals.`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    extractionResult = JSON.parse(raw);
  } catch (err) {
    console.warn("[employee-learning] LLM refresh failed:", err instanceof Error ? err.message : err);
  }

  if (!extractionResult) return;

  const mergeArray = (existing: string[], incoming: string[]): string[] =>
    [...new Set([...existing, ...incoming])].slice(0, 10);
  const mergeStyle = (
    ex: { formality: number; verbosity: number; structurePreference: string } | undefined,
    inc: { formality: number; verbosity: number; structurePreference: string },
  ) => ({
    formality: (ex?.formality ?? 0.5) * 0.8 + (inc.formality ?? 0.5) * 0.2,
    verbosity: (ex?.verbosity ?? 0.5) * 0.8 + (inc.verbosity ?? 0.5) * 0.2,
    structurePreference: inc.structurePreference ?? ex?.structurePreference ?? "mixed",
  });

  const newStyle = mergeStyle(
    existing?.communicationStyle as { formality: number; verbosity: number; structurePreference: string } | undefined,
    extractionResult.communicationStyle,
  );
  const rawConfidence = events.reduce((s, e) => s + e.confidenceContribution, 0);
  const newConfidence = Math.min(1, (existing?.confidenceScore ?? 0) * 0.85 + rawConfidence * 0.15);

  const profileValues = {
    userId,
    botId,
    clientId,
    communicationStyle: newStyle as { formality: number; verbosity: number; structurePreference: "narrative" | "bullets" | "tables" | "mixed" },
    formatPreferences: extractionResult.formatPreferences ?? {},
    expertiseSignals: mergeArray(
      (existing?.expertiseSignals as string[]) ?? [],
      extractionResult.expertiseSignals ?? [],
    ),
    recurringConcerns: mergeArray(
      (existing?.recurringConcerns as string[]) ?? [],
      extractionResult.recurringConcerns ?? [],
    ),
    trustCalibration: newTrust,
    vocabularyTerms: mergeArray(
      (existing?.vocabularyTerms as string[]) ?? [],
      extractionResult.vocabularyTerms ?? [],
    ),
    profileSummary: extractionResult.profileSummary,
    confidenceScore: newConfidence,
    sessionCount: existing?.sessionCount ?? 0,
    lastUpdatedAt: new Date(),
  };

  await db
    .insert(employeeBehavioralProfilesTable)
    .values(profileValues)
    .onConflictDoUpdate({
      target: [employeeBehavioralProfilesTable.userId, employeeBehavioralProfilesTable.botId],
      set: {
        communicationStyle: sql`excluded.communication_style`,
        formatPreferences: sql`excluded.format_preferences`,
        expertiseSignals: sql`excluded.expertise_signals`,
        recurringConcerns: sql`excluded.recurring_concerns`,
        trustCalibration: sql`excluded.trust_calibration`,
        vocabularyTerms: sql`excluded.vocabulary_terms`,
        profileSummary: sql`excluded.profile_summary`,
        confidenceScore: sql`excluded.confidence_score`,
        lastUpdatedAt: sql`excluded.last_updated_at`,
      },
    });

  await feedTrustToCapabilityModel(userId, botId, clientId, newTrust, corrections, approvals).catch(() => {});
}

async function feedTrustToCapabilityModel(
  userId: number,
  botId: number,
  clientId: number,
  trustCalibration: number,
  corrections: number,
  approvals: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(botCapabilityModelTable)
    .where(
      and(
        eq(botCapabilityModelTable.botId, botId),
        eq(botCapabilityModelTable.clientId, clientId),
        eq(botCapabilityModelTable.taskCategory, "task_session"),
      ),
    );

  if (!existing) return;

  const total = corrections + approvals;
  if (total === 0) return;

  const trustSignal = trustCalibration;
  const alpha = 0.1;
  const newCompetence = existing.competence * (1 - alpha) + trustSignal * alpha;
  const newConfidence = Math.min(1, existing.confidence + 0.02);

  await db
    .update(botCapabilityModelTable)
    .set({
      competence: newCompetence,
      confidence: newConfidence,
      lastUpdated: new Date(),
    })
    .where(eq(botCapabilityModelTable.id, existing.id));
}

export async function getEmployeeProfileForBot(
  userId: number,
  botId: number,
): Promise<EmployeeBehavioralProfile | null> {
  const [profile] = await db
    .select()
    .from(employeeBehavioralProfilesTable)
    .where(
      and(
        eq(employeeBehavioralProfilesTable.userId, userId),
        eq(employeeBehavioralProfilesTable.botId, botId),
      ),
    );
  return profile ?? null;
}

export async function buildEmployeeProfileContext(
  userId: number,
  botId: number,
  clientId: number,
  employeeName?: string,
): Promise<string> {
  const profile = await getEmployeeProfileForBot(userId, botId);

  if (profile && profile.confidenceScore >= MIN_CONFIDENCE_FOR_INJECTION && profile.profileSummary) {
    return `\n\n[EMPLOYEE PROFILE — ${employeeName ?? "this employee"}]
${profile.profileSummary}
Communication style: ${profile.communicationStyle ? `formality ${(profile.communicationStyle as { formality: number }).formality?.toFixed(2)}, verbosity ${(profile.communicationStyle as { verbosity: number }).verbosity?.toFixed(2)}, prefers ${(profile.communicationStyle as { structurePreference: string }).structurePreference}` : "unknown"}
${(profile.recurringConcerns as string[] ?? []).length > 0 ? `Known concerns to proactively address: ${(profile.recurringConcerns as string[]).join(", ")}` : ""}
${(profile.vocabularyTerms as string[] ?? []).length > 0 ? `Mirror their vocabulary: ${(profile.vocabularyTerms as string[]).join(", ")}` : ""}
Trust level: ${profile.trustCalibration.toFixed(2)} (based on ${profile.sessionCount} sessions)
[/EMPLOYEE PROFILE]`;
  }

  const baseline = await getOrgBaseline(clientId);
  if (baseline && baseline.profileSummary) {
    return `\n\n[ORG BASELINE PROFILE]
${baseline.profileSummary}
[/ORG BASELINE PROFILE]`;
  }

  return "";
}

export async function getOrgBaseline(clientId: number): Promise<OrgBehavioralBaseline | null> {
  const [baseline] = await db
    .select()
    .from(orgBehavioralBaselinesTable)
    .where(eq(orgBehavioralBaselinesTable.clientId, clientId));
  return baseline ?? null;
}

export async function computeOrgBaseline(clientId: number): Promise<void> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const profiles = await db
    .select()
    .from(employeeBehavioralProfilesTable)
    .where(
      and(
        eq(employeeBehavioralProfilesTable.clientId, clientId),
        gte(employeeBehavioralProfilesTable.sessionCount, 3),
      ),
    );

  if (profiles.length === 0) return;

  const avgFormality = profiles.reduce((s, p) => s + ((p.communicationStyle as { formality: number } | null)?.formality ?? 0.5), 0) / profiles.length;
  const avgVerbosity = profiles.reduce((s, p) => s + ((p.communicationStyle as { verbosity: number } | null)?.verbosity ?? 0.5), 0) / profiles.length;

  const allExpertise = profiles.flatMap((p) => (p.expertiseSignals as string[] ?? []));
  const expertiseFreq: Record<string, number> = {};
  for (const e of allExpertise) expertiseFreq[e] = (expertiseFreq[e] ?? 0) + 1;
  const topExpertise = Object.entries(expertiseFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  const allVocab = profiles.flatMap((p) => (p.vocabularyTerms as string[] ?? []));
  const vocabFreq: Record<string, number> = {};
  for (const v of allVocab) vocabFreq[v] = (vocabFreq[v] ?? 0) + 1;
  const topVocab = Object.entries(vocabFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);

  const summaryParts: string[] = [];
  summaryParts.push(`This organization's employees tend to communicate with ${avgFormality > 0.6 ? "formal" : avgFormality < 0.4 ? "informal" : "neutral"} tone and ${avgVerbosity > 0.6 ? "detailed" : avgVerbosity < 0.4 ? "concise" : "moderate"} responses.`);
  if (topExpertise.length > 0) summaryParts.push(`Common expertise areas: ${topExpertise.join(", ")}.`);
  if (topVocab.length > 0) summaryParts.push(`Frequently used terms: ${topVocab.join(", ")}.`);

  const baselineValues = {
    clientId,
    communicationStyle: {
      formality: avgFormality,
      verbosity: avgVerbosity,
      structurePreference: "mixed" as const,
    },
    expertiseSignals: topExpertise,
    vocabularyTerms: topVocab,
    profileSummary: summaryParts.join(" "),
    contributorCount: profiles.length,
    lastComputedAt: new Date(),
  };

  await db
    .insert(orgBehavioralBaselinesTable)
    .values(baselineValues)
    .onConflictDoUpdate({
      target: orgBehavioralBaselinesTable.clientId,
      set: {
        communicationStyle: sql`excluded.communication_style`,
        expertiseSignals: sql`excluded.expertise_signals`,
        vocabularyTerms: sql`excluded.vocabulary_terms`,
        profileSummary: sql`excluded.profile_summary`,
        contributorCount: sql`excluded.contributor_count`,
        lastComputedAt: sql`excluded.last_computed_at`,
      },
    });
}
