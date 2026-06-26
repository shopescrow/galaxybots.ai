/**
 * Moltbook content engine (Task #207, Phase 2 — voice + naturalness).
 *
 * Turns the dry "value-first template" into content a top-0.01% creator would
 * publish. Three ideas combine here:
 *
 *  1. VOICE — each post/comment is written in the actual persona's voice, pulled
 *     from the bot's `personality` / `title` / `description`, not a shared
 *     template. Two different agents sound like two different people.
 *  2. ANGLE ROTATION — a wide library of opening "hooks" (contrarian take, data
 *     drop, micro-story, myth-bust, …) is rotated so an agent never opens the
 *     same way twice in a row. This is what makes a feed feel human.
 *  3. STYLE EMULATION — Moltbook is full of agents built very differently (terse
 *     + technical, hype-y, playful, formal). `analyzeCounterpartyStyle` reads the
 *     thread it's replying to and the generator mirrors that register/energy
 *     while keeping its own personality — so replies land naturally.
 *
 * Generation uses the shared OpenAI integration; if the model is unavailable it
 * falls back to a deterministic, still-on-voice template so the heartbeat never
 * blocks. Whatever this produces still passes the outbound governance gates
 * (brand voice + consequence + credential-exfil) and the approval queue before
 * anything is sent — this engine only drafts.
 */

import { openai } from "@workspace/integrations-openai-ai-server";
import type { Bot } from "@workspace/db";
import type { MoltbookCatalogEntry } from "./moltbook-bizdev";

const CONTENT_MODEL = "gpt-5-mini";
const MAX_COMMENT_LEN = 1000;
const MAX_POST_LEN = 1500;

/** The slice of a bot we need to speak in its voice. */
export type MoltbookPersona = Pick<Bot, "name" | "title" | "personality" | "description"> & {
  responsibilities?: string[] | null;
};

// ---------------------------------------------------------------------------
// Opening-angle library — the "hooks" a great creator rotates through.
// ---------------------------------------------------------------------------

export interface OpeningAngle {
  id: string;
  label: string;
  /** Creative direction handed to the model. */
  direction: string;
  /** Deterministic fallback opener when the model is unavailable. */
  fallback: (topic: string) => string;
}

/** A wide rotation so the feed never feels copy-pasted. */
export const OPENING_ANGLES: readonly OpeningAngle[] = [
  {
    id: "contrarian",
    label: "Contrarian take",
    direction: "Open with a confident, specific contrarian take that challenges the common assumption. Earn the disagreement, don't just be edgy.",
    fallback: (t) => `Hot take: most of the advice on ${t} is backwards.`,
  },
  {
    id: "data_drop",
    label: "Data drop",
    direction: "Open with a concrete, believable observation or pattern (no fabricated precise statistics) that reframes the topic.",
    fallback: (t) => `The pattern we keep seeing with ${t} is the opposite of what people expect.`,
  },
  {
    id: "provocative_question",
    label: "Provocative question",
    direction: "Open with a sharp question that makes the reader stop and reconsider their approach. End the piece inviting answers.",
    fallback: (t) => `Genuine question: who's actually getting ${t} right, and how?`,
  },
  {
    id: "micro_story",
    label: "Micro-story",
    direction: "Open with a tiny, specific moment or anecdote (2-3 sentences) that illustrates the point before drawing the lesson.",
    fallback: (t) => `We learned this the hard way with ${t}.`,
  },
  {
    id: "myth_bust",
    label: "Myth-bust",
    direction: "Name a widely repeated myth about the topic, then dismantle it crisply.",
    fallback: (t) => `Myth: ${t} is a solved problem. It isn't.`,
  },
  {
    id: "framework",
    label: "Framework",
    direction: "Offer a small, memorable framework or mental model (2-4 steps) the reader can actually use.",
    fallback: (t) => `A simple way to think about ${t}:`,
  },
  {
    id: "prediction",
    label: "Prediction",
    direction: "Open with a near-future prediction about where this space is heading, then back it with reasoning.",
    fallback: (t) => `Prediction: ${t} looks completely different 12 months from now.`,
  },
  {
    id: "behind_scenes",
    label: "Build-in-public",
    direction: "Share a candid behind-the-scenes detail about how this is actually done in practice, flaws included.",
    fallback: (t) => `Building in public: here's what's actually working for us on ${t}.`,
  },
  {
    id: "pattern_spotting",
    label: "Pattern-spotting",
    direction: "Point out a non-obvious pattern connecting a few things the reader hadn't linked before.",
    fallback: (t) => `Three unrelated-looking problems with ${t} are actually the same problem.`,
  },
  {
    id: "unpopular_opinion",
    label: "Unpopular opinion",
    direction: "State an unpopular but defensible opinion plainly, then give the reasoning that makes it land.",
    fallback: (t) => `Unpopular opinion on ${t}, but hear me out:`,
  },
  {
    id: "analogy",
    label: "Analogy",
    direction: "Explain the topic through a vivid analogy from a totally different domain.",
    fallback: (t) => `${t} is a lot like something you'd never expect.`,
  },
  {
    id: "checklist",
    label: "Checklist",
    direction: "Give a short, scannable checklist of things that matter, lead with the one nobody does.",
    fallback: (t) => `Quick gut-check on ${t}:`,
  },
  {
    id: "i_was_wrong",
    label: "I-was-wrong",
    direction: "Admit a belief you've changed your mind on, then explain what changed it. Vulnerability earns trust.",
    fallback: (t) => `I used to be completely wrong about ${t}.`,
  },
  {
    id: "nobody_tells_you",
    label: "Nobody-tells-you",
    direction: "Reveal the thing experienced people know about this but rarely say out loud.",
    fallback: (t) => `What nobody tells you about ${t}:`,
  },
  {
    id: "tiny_experiment",
    label: "Tiny-experiment",
    direction: "Describe a small experiment anyone could run this week to learn something about the topic.",
    fallback: (t) => `Try this small experiment with ${t} this week:`,
  },
  {
    id: "steelman",
    label: "Steelman",
    direction: "Steelman the view you disagree with first, then show where it breaks down. Generous, then incisive.",
    fallback: (t) => `The strongest case for the usual take on ${t} — and where it falls apart:`,
  },
] as const;

const lastAngleByKey = new Map<string, string>();

/**
 * Pick an opening angle, avoiding an immediate repeat for the same key
 * (e.g. `${botId}:comment`) so a single agent's voice stays varied.
 */
export function pickOpeningAngle(rotationKey: string): OpeningAngle {
  const last = lastAngleByKey.get(rotationKey);
  let choice = OPENING_ANGLES[Math.floor(Math.random() * OPENING_ANGLES.length)];
  for (let guard = 0; choice.id === last && guard < 6; guard++) {
    choice = OPENING_ANGLES[Math.floor(Math.random() * OPENING_ANGLES.length)];
  }
  lastAngleByKey.set(rotationKey, choice.id);
  return choice;
}

// ---------------------------------------------------------------------------
// Counterparty style detection — so we can read the room and emulate.
// ---------------------------------------------------------------------------

export interface CounterpartyStyle {
  register: "formal" | "casual" | "technical" | "hype" | "playful";
  energy: "low" | "medium" | "high";
  emoji: "none" | "light" | "heavy";
  length: "terse" | "medium" | "verbose";
  usesQuestions: boolean;
  usesLists: boolean;
  /** A short human-readable summary handed to the model. */
  descriptor: string;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const JARGON_RE = /\b(api|sdk|llm|rag|vector|embedding|latency|throughput|inference|pipeline|schema|endpoint|token|fine-?tune|prompt|agentic|webhook|k8s|infra)\b/i;
const CASUAL_RE = /\b(lol|lmao|tbh|imo|ngl|gonna|wanna|kinda|yeah|nah|vibe|fr|honestly)\b|'(s|re|ll|ve|m|t)\b/i;

/** Heuristically read a (sanitized) thread's voice so we can mirror it. */
export function analyzeCounterpartyStyle(text: string | undefined | null): CounterpartyStyle {
  const raw = (text ?? "").trim();
  const lower = raw.toLowerCase();
  const words = raw ? raw.split(/\s+/).length : 0;
  const emojiCount = (raw.match(EMOJI_RE) ?? []).length;
  const exclamations = (raw.match(/!/g) ?? []).length;
  const capsWords = (raw.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  const usesQuestions = raw.includes("?");
  const usesLists = /(^|\n)\s*([-*•]|\d+[.)])\s+/.test(raw);

  const emoji: CounterpartyStyle["emoji"] = emojiCount >= 3 ? "heavy" : emojiCount >= 1 ? "light" : "none";
  const length: CounterpartyStyle["length"] = words <= 25 ? "terse" : words <= 90 ? "medium" : "verbose";

  const hypeScore = exclamations + capsWords + (emoji === "heavy" ? 2 : 0);
  const isTechnical = JARGON_RE.test(raw);
  const isCasual = CASUAL_RE.test(lower);

  let register: CounterpartyStyle["register"];
  if (hypeScore >= 3) register = "hype";
  else if (isTechnical) register = "technical";
  else if (emoji !== "none" && isCasual) register = "playful";
  else if (isCasual) register = "casual";
  else register = "formal";

  const energy: CounterpartyStyle["energy"] =
    hypeScore >= 3 || emoji === "heavy" ? "high" : hypeScore >= 1 || emoji === "light" ? "medium" : "low";

  const descriptor =
    `${register}, ${energy}-energy, ${length}` +
    `${emoji === "none" ? ", no emoji" : `, ${emoji} emoji`}` +
    `${usesQuestions ? ", asks questions" : ""}${usesLists ? ", uses lists" : ""}`;

  return { register, energy, emoji, length, usesQuestions, usesLists, descriptor };
}

// ---------------------------------------------------------------------------
// Generation.
// ---------------------------------------------------------------------------

export interface GenerateContentParams {
  mode: "comment" | "post";
  persona: MoltbookPersona;
  /** The approved product to (softly) weave in, if one fits. Optional. */
  product?: MoltbookCatalogEntry | null;
  angle: OpeningAngle;
  /** Target submolt (community) for a post. */
  submolt?: string | null;
  /** The thread being replied to (comment mode). Already sanitized. */
  thread?: { title?: string; body?: string; authorHandle?: string | null } | null;
  /** The counterparty's detected style (comment mode) to mirror. */
  counterpartyStyle?: CounterpartyStyle | null;
}

export interface GeneratedContent {
  /** Post title (post mode only). */
  title?: string;
  body: string;
  usedModel: boolean;
  angleId: string;
}

function personaSystemPrompt(persona: MoltbookPersona, mode: "comment" | "post"): string {
  const resp = persona.responsibilities?.length
    ? `\nFocus areas: ${persona.responsibilities.slice(0, 4).join(", ")}.`
    : "";
  return [
    `You are ${persona.name}, ${persona.title}.`,
    `Your personality: ${persona.personality}`,
    persona.description ? `About you: ${persona.description}` : "",
    resp,
    "",
    "You are a top-0.01% content creator active on Moltbook, a social network whose members are AI agents — many of them built very differently from you (some terse and technical, some hype-driven, some playful, some formal). You are magnetic, specific, and high-signal. You start conversations people want to join.",
    "",
    "Hard rules:",
    "- Sound unmistakably like YOURSELF. Your voice should be distinct from any other agent's.",
    "- Be a conversation starter and a lead generator, never a billboard. Lead with genuine value; invite replies.",
    "- Be concrete and specific. No generic platitudes, no buzzword soup, no 'As an AI'.",
    "- Only reference a product if it is genuinely relevant, and only the approved one-line value prop you are given. Never invent products, prices, features, guarantees, or claims.",
    "- Never request, share, or reference credentials, API keys, or secrets.",
    "- No hashtags spam, no @-spam. At most light, natural emoji use if it fits your voice.",
    mode === "comment"
      ? "- This is a REPLY. Read the room: mirror the other agent's register and energy (you'll be told their style) while staying in your own voice. Add a new angle, don't just agree."
      : "- This is an ORIGINAL POST meant to spark a thread. Open with a scroll-stopping hook and end with something that pulls replies (a real question or a sharp claim).",
  ]
    .filter(Boolean)
    .join("\n");
}

function userPrompt(params: GenerateContentParams): string {
  const lines: string[] = [];
  lines.push(`Opening angle to use: ${params.angle.label} — ${params.angle.direction}`);

  if (params.product) {
    lines.push(
      `If (and only if) it fits naturally, you may weave in this approved value prop once, in your own words: "${params.product.pitch}". Do not hard-sell.`,
    );
  } else {
    lines.push("Do not pitch any product in this one — pure value. (Soft interest will be captured separately.)");
  }

  if (params.mode === "comment" && params.thread) {
    lines.push("");
    lines.push("You are replying to this thread (already safety-screened):");
    if (params.thread.title) lines.push(`Title: ${params.thread.title}`);
    if (params.thread.body) lines.push(`Body: ${params.thread.body.slice(0, 800)}`);
    if (params.counterpartyStyle) {
      lines.push("");
      lines.push(`The other agent's style to mirror: ${params.counterpartyStyle.descriptor}.`);
    }
    lines.push("");
    lines.push(`Write a single reply (max ${MAX_COMMENT_LEN} characters). Output ONLY the reply text.`);
  } else {
    lines.push("");
    if (params.submolt) lines.push(`Submolt (community) you're posting in: ${params.submolt}.`);
    lines.push(
      `Write an original post (max ${MAX_POST_LEN} characters). Output the title on the FIRST line, then a blank line, then the body. No labels like "Title:".`,
    );
  }
  return lines.join("\n");
}

function buildFallback(params: GenerateContentParams): GeneratedContent {
  const topic = (params.thread?.title || params.submolt || "this").toString().slice(0, 80);
  const opener = params.angle.fallback(topic.replace(/^"|"$/g, ""));
  const valueLine = params.product
    ? `${params.product.pitch} Happy to compare notes if it's useful.`
    : "Curious how others are approaching it — happy to share what's worked for us.";

  if (params.mode === "comment") {
    const body = `${opener} ${valueLine}`.slice(0, MAX_COMMENT_LEN);
    return { body, usedModel: false, angleId: params.angle.id };
  }
  const title = opener.replace(/[:.]$/, "").slice(0, 120);
  const body = `${opener}\n\n${valueLine}\n\nWhat's working (or not) for you?`.slice(0, MAX_POST_LEN);
  return { title, body, usedModel: false, angleId: params.angle.id };
}

// Invented commercial claims our agents must never make — prices, discounts,
// guarantees, refunds. The approved catalog pitches contain none of these, so a
// match means the model drifted; we reject rather than publish.
const INVENTED_PRICE_RE =
  /\$\s?\d|\b\d+\s?(usd|dollars|bucks)\b|\b\d{1,3}%\s?(off|discount)\b|\bfor \$?\d+\s?\/?\s?(mo|month|yr|year|seat|user)\b/i;
const INVENTED_GUARANTEE_RE =
  /\b(money-?back|guarantee[ds]?|free forever|lifetime free|no-?risk|risk-?free|full refund)\b/i;

/**
 * Deterministic backstop: returns a reason string when generated content makes a
 * commercial claim (price, discount, guarantee, refund) that isn't in the fixed
 * catalog, else null. Runs in addition to — not instead of — the governance gates.
 */
export function detectInventedCommercialClaim(text: string): string | null {
  if (INVENTED_PRICE_RE.test(text)) {
    return "Generated content stated a price/discount not in the approved catalog.";
  }
  if (INVENTED_GUARANTEE_RE.test(text)) {
    return "Generated content stated a guarantee/refund not in the approved catalog.";
  }
  return null;
}

/**
 * Generate an on-voice, naturally varied comment or post for an agent. Uses the
 * shared model; on any failure returns a deterministic on-voice fallback so the
 * heartbeat never blocks. Output still flows through governance + approval.
 */
export async function generateMoltbookContent(params: GenerateContentParams): Promise<GeneratedContent> {
  try {
    const completion = await openai.chat.completions.create({
      model: CONTENT_MODEL,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: personaSystemPrompt(params.persona, params.mode) },
        { role: "user", content: userPrompt(params) },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return buildFallback(params);

    if (params.mode === "comment") {
      return { body: raw.slice(0, MAX_COMMENT_LEN), usedModel: true, angleId: params.angle.id };
    }

    // Post: first non-empty line is the title, the rest is the body.
    const lines = raw.split("\n");
    const titleIdx = lines.findIndex((l) => l.trim().length > 0);
    const title = (lines[titleIdx] ?? "").trim().replace(/^#+\s*/, "").slice(0, 120);
    const body = lines.slice(titleIdx + 1).join("\n").trim() || raw;
    return { title: title || undefined, body: body.slice(0, MAX_POST_LEN), usedModel: true, angleId: params.angle.id };
  } catch {
    return buildFallback(params);
  }
}
