/**
 * Novel Role Discovery — weekly gap analysis job.
 *
 * Identifies clusters of unmet objectives using TF-IDF cosine-similarity semantic
 * clustering (vs. first-3-words heuristic):
 * - Tokenizes objectives into TF-IDF weighted term vectors
 * - Greedily groups sessions whose vectors share cosine similarity ≥ 0.25
 * - Filters to clusters with ≥ 20 sessions and avg success rate < 60%
 * - Generates proposed role specifications for each gap cluster
 */

import {
  db,
  sessionOutcomesTable,
  roleGapSignalsTable,
} from "@workspace/db";
import { eq, and, gte, isNotNull } from "drizzle-orm";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
let lastRoleDiscoveryRun = 0;

const MIN_CLUSTER_SIZE = 20;
const MAX_SUCCESS_RATE_THRESHOLD = 0.6;
const SIMILARITY_THRESHOLD = 0.25;

interface SessionRecord {
  objective: string;
  isSuccess: boolean;
}

// ── TF-IDF semantic clustering ───────────────────────────────────────────────

/** Tokenize a string into lower-cased alphanumeric terms (stop-words removed) */
const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","been","by","do","for","from","has","have",
  "how","i","in","is","it","its","of","on","or","our","that","the","this","to",
  "was","we","were","what","when","where","which","who","will","with","you",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Build TF map for a document */
function computeTF(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const total = Math.max(1, tokens.length);
  const tf = new Map<string, number>();
  for (const [term, cnt] of counts) tf.set(term, cnt / total);
  return tf;
}

/** Build IDF map from all documents */
function computeIDF(tokenLists: string[][]): Map<string, number> {
  const docCount = tokenLists.length;
  const docFreq = new Map<string, number>();
  for (const tokens of tokenLists) {
    const seen = new Set(tokens);
    for (const t of seen) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((docCount + 1) / (df + 1)) + 1);
  }
  return idf;
}

/** Compute cosine similarity between two TF-IDF vectors */
function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, valA] of vecA) {
    dot += valA * (vecB.get(term) ?? 0);
    normA += valA * valA;
  }
  for (const valB of vecB.values()) normB += valB * valB;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface ClusterGroup {
  sessions: SessionRecord[];
  centroidTokens: string[];   // most frequent terms in cluster (for label generation)
  centroidVec: Map<string, number>;
}

/**
 * Greedy TF-IDF cosine similarity clustering.
 * Seeds a new cluster from each unassigned session; merges subsequent sessions whose
 * similarity to the running cluster centroid meets the threshold.
 */
function clusterObjectivesSemantic(
  sessions: SessionRecord[],
): Map<string, SessionRecord[]> {
  if (sessions.length === 0) return new Map();

  // Tokenize all objectives
  const tokenLists = sessions.map((s) => tokenize(s.objective));
  const idf = computeIDF(tokenLists);

  // Compute TF-IDF vectors
  const vecs: Map<string, number>[] = tokenLists.map((tokens) => {
    const tf = computeTF(tokens);
    const tfidf = new Map<string, number>();
    for (const [term, tfVal] of tf) {
      tfidf.set(term, tfVal * (idf.get(term) ?? 1));
    }
    return tfidf;
  });

  const assigned = new Array<boolean>(sessions.length).fill(false);
  const clusters: ClusterGroup[] = [];

  for (let i = 0; i < sessions.length; i++) {
    if (assigned[i]) continue;

    // Seed a new cluster
    const clusterSessions: SessionRecord[] = [sessions[i]];
    const clusterVecs: Map<string, number>[] = [vecs[i]];
    assigned[i] = true;

    // Merge similar unassigned sessions into this cluster
    for (let j = i + 1; j < sessions.length; j++) {
      if (assigned[j]) continue;
      // Compare to every cluster member; take max similarity (single-linkage)
      const maxSim = Math.max(...clusterVecs.map((cv) => cosineSimilarity(cv, vecs[j])));
      if (maxSim >= SIMILARITY_THRESHOLD) {
        clusterSessions.push(sessions[j]);
        clusterVecs.push(vecs[j]);
        assigned[j] = true;
      }
    }

    // Compute centroid vector (element-wise mean)
    const centroid = new Map<string, number>();
    for (const vec of clusterVecs) {
      for (const [term, val] of vec) {
        centroid.set(term, (centroid.get(term) ?? 0) + val / clusterVecs.length);
      }
    }

    // Top terms by centroid weight → cluster label
    const topTerms = [...centroid.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([term]) => term);

    clusters.push({ sessions: clusterSessions, centroidTokens: topTerms, centroidVec: centroid });
  }

  // Return as Map<clusterLabel, sessions>
  const result = new Map<string, SessionRecord[]>();
  for (const cluster of clusters) {
    const label = cluster.centroidTokens.slice(0, 3).join(" ") || "general";
    // Deduplicate labels (multiple clusters may share top terms)
    let key = label;
    let suffix = 1;
    while (result.has(key)) key = `${label}_${++suffix}`;
    result.set(key, cluster.sessions);
  }

  return result;
}

function generateProposedPersona(
  clusterKeywords: string[],
  gapDescription: string,
  avgSuccessRate: number,
) {
  const topic = clusterKeywords.slice(0, 2).join(" ");
  const roleGuess =
    clusterKeywords.some((k) => ["finance", "cost", "budget", "invoice", "payment", "billing"].includes(k))
      ? "Financial Advisor Bot"
      : clusterKeywords.some((k) => ["sales", "pipeline", "prospect", "deal", "crm", "lead"].includes(k))
      ? "Sales Intelligence Bot"
      : clusterKeywords.some((k) => ["hr", "recruit", "hiring", "onboard", "employee", "talent"].includes(k))
      ? "HR Operations Bot"
      : clusterKeywords.some((k) =>
          ["compliance", "legal", "gdpr", "audit", "regulatory", "policy"].includes(k),
        )
      ? "Compliance Guardian Bot"
      : clusterKeywords.some((k) => ["customer", "support", "ticket", "help", "service", "refund"].includes(k))
      ? "Customer Support Bot"
      : clusterKeywords.some((k) => ["report", "analytics", "insight", "metric", "dashboard", "data"].includes(k))
      ? "Analytics Intelligence Bot"
      : `${topic.charAt(0).toUpperCase() + topic.slice(1)} Specialist Bot`;

  return {
    name: roleGuess.replace(/\s+/g, ""),
    title: roleGuess,
    department: clusterKeywords[0]
      ? clusterKeywords[0].charAt(0).toUpperCase() + clusterKeywords[0].slice(1)
      : "Operations",
    description: `Specialized bot for handling ${gapDescription}. Current success rate: ${(avgSuccessRate * 100).toFixed(0)}%.`,
    responsibilities: [
      `Handle ${topic}-related tasks autonomously`,
      "Escalate only when human judgment is explicitly required",
      "Learn from historical outcome patterns in this domain",
    ],
    suggestedTools: ["send_email", "create_task", "update_crm", "generate_report"],
    targetClientProfiles: ["enterprise", "smb"],
    systemPromptDraft: `You are a ${roleGuess} specializing in ${topic}. Your primary goal is to handle ${gapDescription} with high accuracy and minimal escalation. Use available tools proactively and always confirm before irreversible actions.`,
  };
}

export async function runNovelRoleDiscovery() {
  const now = Date.now();
  if (now - lastRoleDiscoveryRun < SEVEN_DAYS_MS) return;
  lastRoleDiscoveryRun = now;

  console.log("[role-discovery] Running weekly novel role discovery (TF-IDF semantic clustering)...");

  const since = new Date(now - 30 * 24 * 60 * 60 * 1000);

  try {
    // Fetch only FAILING sessions (outcome_score < 60%, proxied by failureCategory IS NOT NULL).
    // Role gap discovery targets the failure space: we cluster what bots can't handle,
    // not successful sessions, to avoid generating spurious proposals for already-covered roles.
    const allSessions = await db
      .select({
        sessionId: sessionOutcomesTable.sessionId,
        objective: sessionOutcomesTable.outcomeSummary,
      })
      .from(sessionOutcomesTable)
      .where(
        and(
          gte(sessionOutcomesTable.createdAt, since),
          isNotNull(sessionOutcomesTable.outcomeSummary),
          isNotNull(sessionOutcomesTable.failureCategory),  // only failing sessions
        ),
      )
      .limit(10000);

    if (allSessions.length === 0) {
      console.log("[role-discovery] No failing sessions to analyze.");
      return;
    }

    // All fetched sessions are failures (outcome_score < 60%)
    const sessionRecords: SessionRecord[] = allSessions.map((s) => ({
      objective: s.objective ?? "",
      isSuccess: false,
    }));

    // Use TF-IDF cosine-similarity semantic clustering instead of first-3-words heuristic
    const clusters = clusterObjectivesSemantic(sessionRecords);
    let proposalsCreated = 0;

    for (const [clusterKey, sessions] of clusters.entries()) {
      const totalSessions = sessions.length;
      if (totalSessions < MIN_CLUSTER_SIZE) continue;

      // All sessions in this set are failures (outcome_score < 60%).
      // avgSuccessRate is always 0; we report it as 0% in the proposal description.
      const avgSuccessRate = 0;

      const gapDescription = `handling "${clusterKey}" tasks (0% success across ${totalSessions} failing sessions in last 30 days)`;
      const clusterKeywords = clusterKey.replace(/_\d+$/, "").split(" ");
      const proposedPersona = generateProposedPersona(
        clusterKeywords,
        gapDescription,
        avgSuccessRate,
      );

      const evidenceObjectives = sessions
        .slice(0, 10)
        .map((s) => s.objective)
        .filter(Boolean);

      // Deduplicate: skip if a pending signal already exists for this cluster
      const existingSignal = await db
        .select({ id: roleGapSignalsTable.id })
        .from(roleGapSignalsTable)
        .where(
          and(
            eq(roleGapSignalsTable.clusterId, clusterKey),
            eq(roleGapSignalsTable.status, "pending"),
          ),
        )
        .limit(1);

      if (existingSignal.length > 0) continue;

      await db.insert(roleGapSignalsTable).values({
        gapDescription,
        evidenceSessions: totalSessions,
        avgSuccessRate,
        clusterId: clusterKey,
        clusterKeywords,
        proposedRoleName: proposedPersona.title,
        proposedPersona,
        evidenceObjectives,
        status: "pending",
      });

      proposalsCreated++;
      console.log(
        `[role-discovery] Proposed new role "${proposedPersona.title}" for cluster "${clusterKey}" ` +
          `(${totalSessions} sessions, ${(avgSuccessRate * 100).toFixed(1)}% success rate)`,
      );
    }

    console.log(`[role-discovery] Created ${proposalsCreated} new role proposals.`);
  } catch (err) {
    console.error("[role-discovery] Error during role discovery:", err);
  }
}
