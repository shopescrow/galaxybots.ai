import { Router, type IRouter } from "express";
import {
  db,
  proposalsTable,
} from "@workspace/db";
import type { ProposalSection } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireRole } from "../middleware/auth";
import { llmRateLimit } from "../middleware/rate-limit";
import { buildClientContext } from "../services/client-context";
import { buildKnowledgeBaseContext } from "../services/knowledge-base";
import crypto from "crypto";

const router: IRouter = Router();

const PROPOSAL_SECTIONS = [
  { id: "executive_summary", title: "Executive Summary", order: 0 },
  { id: "problem_statement", title: "Problem Statement", order: 1 },
  { id: "proposed_solution", title: "Proposed Solution", order: 2 },
  { id: "scope_of_work", title: "Scope of Work", order: 3 },
  { id: "timeline", title: "Timeline", order: 4 },
  { id: "investment", title: "Investment", order: 5 },
  { id: "call_to_action", title: "Call to Action", order: 6 },
];

const PITCH_SLIDES = [
  { id: "slide_title", title: "Slide 1: Title & Hook", order: 0 },
  { id: "slide_problem", title: "Slide 2: The Problem", order: 1 },
  { id: "slide_solution", title: "Slide 3: Our Solution", order: 2 },
  { id: "slide_approach", title: "Slide 4: Approach & Methodology", order: 3 },
  { id: "slide_differentiators", title: "Slide 5: Why Us / Differentiators", order: 4 },
  { id: "slide_case_studies", title: "Slide 6: Case Studies / Social Proof", order: 5 },
  { id: "slide_timeline", title: "Slide 7: Timeline & Milestones", order: 6 },
  { id: "slide_pricing", title: "Slide 8: Investment & Pricing", order: 7 },
  { id: "slide_team", title: "Slide 9: Your Team", order: 8 },
  { id: "slide_next_steps", title: "Slide 10: Next Steps & CTA", order: 9 },
];

router.get("/proposals", async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const { status, type } = req.query;

    const proposals = await db
      .select()
      .from(proposalsTable)
      .where(eq(proposalsTable.clientId, clientId))
      .orderBy(desc(proposalsTable.updatedAt));

    const filtered = proposals.filter((p) => {
      if (status && p.status !== status) return false;
      if (type && p.type !== type) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    console.error("Failed to list proposals:", err);
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

router.get("/proposals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid proposal ID" }); return; }

  const [proposal] = await db
    .select()
    .from(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.clientId, req.user!.clientId)));

  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(proposal);
});

router.post("/proposals", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const { prospectName, prospectIndustry, type, value, prospectDetails } = req.body;

  if (!prospectName || typeof prospectName !== "string") {
    res.status(400).json({ error: "Prospect name is required" });
    return;
  }

  const validTypes = ["proposal", "pitch", "rfp"];
  if (type && !validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  try {
    const [proposal] = await db.insert(proposalsTable).values({
      clientId: req.user!.clientId,
      prospectName,
      prospectIndustry: prospectIndustry || null,
      type: type || "proposal",
      status: "draft",
      sections: [],
      prospectDetails: prospectDetails || {},
      value: value || null,
    }).returning();

    res.status(201).json(proposal);
  } catch (err) {
    console.error("Failed to create proposal:", err);
    res.status(500).json({ error: "Failed to create proposal" });
  }
});

router.put("/proposals/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid proposal ID" }); return; }

  const [existing] = await db.select().from(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.clientId, req.user!.clientId)));
  if (!existing) { res.status(404).json({ error: "Proposal not found" }); return; }

  const { prospectName, prospectIndustry, sections, value } = req.body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (prospectName) updates.prospectName = prospectName;
  if (prospectIndustry !== undefined) updates.prospectIndustry = prospectIndustry;
  if (sections) updates.sections = sections;
  if (value !== undefined) updates.value = value;

  const [updated] = await db.update(proposalsTable).set(updates)
    .where(eq(proposalsTable.id, id)).returning();

  res.json(updated);
});

router.put("/proposals/:id/sections/:sectionId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const sectionId = req.params.sectionId;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid proposal ID" }); return; }

  const [existing] = await db.select().from(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.clientId, req.user!.clientId)));
  if (!existing) { res.status(404).json({ error: "Proposal not found" }); return; }

  const { content, title, speakerNotes } = req.body;
  const sections = [...(existing.sections || [])];
  const idx = sections.findIndex((s) => s.id === sectionId);

  if (idx === -1) { res.status(404).json({ error: "Section not found" }); return; }

  if (content !== undefined) sections[idx].content = content;
  if (title !== undefined) sections[idx].title = title;
  if (speakerNotes !== undefined) sections[idx].speakerNotes = speakerNotes;

  const [updated] = await db.update(proposalsTable).set({
    sections,
    updatedAt: new Date(),
  }).where(eq(proposalsTable.id, id)).returning();

  res.json(updated);
});

router.patch("/proposals/:id/status", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid proposal ID" }); return; }

  const { status } = req.body;
  const validStatuses = ["draft", "sent", "won", "lost"];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  const [existing] = await db.select().from(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.clientId, req.user!.clientId)));
  if (!existing) { res.status(404).json({ error: "Proposal not found" }); return; }

  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "sent" && !existing.sentAt) updates.sentAt = new Date();
  if (status === "won") updates.wonAt = new Date();
  if (status === "lost") updates.lostAt = new Date();

  const [updated] = await db.update(proposalsTable).set(updates)
    .where(eq(proposalsTable.id, id)).returning();

  res.json(updated);
});

router.delete("/proposals/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid proposal ID" }); return; }

  const [deleted] = await db.delete(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.clientId, req.user!.clientId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json({ success: true });
});

router.post("/proposals/:id/share", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid proposal ID" }); return; }

  const [existing] = await db.select().from(proposalsTable)
    .where(and(eq(proposalsTable.id, id), eq(proposalsTable.clientId, req.user!.clientId)));
  if (!existing) { res.status(404).json({ error: "Proposal not found" }); return; }

  const shareToken = existing.shareToken || crypto.randomBytes(24).toString("hex");

  if (!existing.shareToken) {
    await db.update(proposalsTable).set({ shareToken, updatedAt: new Date() })
      .where(eq(proposalsTable.id, id));
  }

  res.json({ shareToken });
});

router.get("/proposals/shared/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  if (!token || token.length < 10) { res.status(400).json({ error: "Invalid token" }); return; }

  const [proposal] = await db
    .select()
    .from(proposalsTable)
    .where(eq(proposalsTable.shareToken, token));

  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }

  res.json({
    prospectName: proposal.prospectName,
    prospectIndustry: proposal.prospectIndustry,
    type: proposal.type,
    sections: proposal.sections,
    createdAt: proposal.createdAt,
  });
});

function buildGenerationContext(
  proposalType: string,
  clientContext: string,
  kbContext: string,
  rfpText?: string,
  rfpAnalysis?: { requirements?: { priority: string; requirement: string }[]; questions?: { question: string }[]; complianceNotes?: string },
) {
  let rfpContextBlock = "";
  if (proposalType === "rfp" && (rfpText || rfpAnalysis)) {
    const parts: string[] = [];
    if (rfpAnalysis?.requirements?.length) {
      parts.push("KEY REQUIREMENTS:\n" + rfpAnalysis.requirements.map((r) => `- [${r.priority}] ${r.requirement}`).join("\n"));
    }
    if (rfpAnalysis?.questions?.length) {
      parts.push("QUESTIONS TO ADDRESS:\n" + rfpAnalysis.questions.map((q) => `- ${q.question}`).join("\n"));
    }
    if (rfpAnalysis?.complianceNotes) {
      parts.push(`COMPLIANCE NOTES: ${rfpAnalysis.complianceNotes}`);
    }
    if (rfpText) {
      parts.push(`ORIGINAL RFP TEXT:\n${rfpText.substring(0, 8000)}`);
    }
    rfpContextBlock = "\n\nRFP ANALYSIS:\n" + parts.join("\n\n");
  }
  return rfpContextBlock;
}

function buildSectionPrompt(
  template: { id: string; title: string; order: number },
  proposalType: string,
  prospectName: string,
  prospectIndustry: string | undefined,
  servicePitch: string | undefined,
  painPoints: string | undefined,
  desiredOutcome: string | undefined,
  clientContext: string,
  kbContext: string,
  rfpContextBlock: string,
  previousSections: ProposalSection[],
) {
  const prevContext = previousSections.length > 0
    ? "\n\nPREVIOUS SECTIONS ALREADY WRITTEN:\n" + previousSections.map((s) => `### ${s.title}\n${s.content.substring(0, 500)}`).join("\n\n")
    : "";

  const isPitch = proposalType === "pitch";

  const systemPrompt = isPitch
    ? `You are an expert pitch deck strategist and CMO. Write ONE specific slide for a presentation. Provide the content in markdown AND speaker notes. Format your response as JSON: { "content": "<slide content in markdown>", "speakerNotes": "<what to say during this slide>" }
${clientContext}
${kbContext ? `\nKNOWLEDGE BASE CONTEXT:\n${kbContext}` : ""}`
    : proposalType === "rfp"
    ? `You are an expert RFP response strategist. Write ONE specific section of an RFP response. Be comprehensive, compliant, and thorough. Format your response as JSON: { "content": "<section content in markdown>" }
${clientContext}
${kbContext ? `\nKNOWLEDGE BASE CONTEXT:\n${kbContext}` : ""}`
    : `You are a senior Director of Sales and proposal strategist. Write ONE specific section of a business proposal. Be detailed, professional, and persuasive. Format your response as JSON: { "content": "<section content in markdown>" }
${clientContext}
${kbContext ? `\nKNOWLEDGE BASE CONTEXT:\n${kbContext}` : ""}`;

  const userPrompt = `Write the "${template.title}" section for a ${proposalType === "pitch" ? "pitch deck" : proposalType === "rfp" ? "RFP response" : "business proposal"}.

PROSPECT: ${prospectName}
${prospectIndustry ? `INDUSTRY: ${prospectIndustry}` : ""}
${servicePitch ? `SERVICE BEING PROPOSED: ${servicePitch}` : ""}
${painPoints ? `KEY PAIN POINTS: ${painPoints}` : ""}
${desiredOutcome ? `DESIRED OUTCOME: ${desiredOutcome}` : ""}
${rfpContextBlock}
${prevContext}

Write ONLY the "${template.title}" section. Make it detailed, persuasive, and tailored to the prospect. Use markdown formatting.`;

  return { systemPrompt, userPrompt };
}

router.post("/proposals/generate", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const {
    prospectName,
    prospectIndustry,
    servicePitch,
    painPoints,
    desiredOutcome,
    type,
    proposalId,
    rfpText,
    rfpAnalysis,
  } = req.body;

  if (!prospectName) { res.status(400).json({ error: "Prospect name is required" }); return; }

  const proposalType = type || "proposal";
  const clientId = req.user!.clientId;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let clientContext = "";
    try { clientContext = await buildClientContext(clientId); } catch (_e) {}

    let kbContext = "";
    try {
      kbContext = await buildKnowledgeBaseContext(
        clientId,
        `${prospectName} ${prospectIndustry || ""} ${servicePitch || ""} proposal`
      );
    } catch (_e) {}

    const sectionTemplates = proposalType === "pitch" ? PITCH_SLIDES : PROPOSAL_SECTIONS;
    const rfpContextBlock = buildGenerationContext(proposalType, clientContext, kbContext, rfpText, rfpAnalysis);

    sendEvent("status", { message: `Starting generation of ${sectionTemplates.length} sections...`, total: sectionTemplates.length });

    const completedSections: ProposalSection[] = [];

    for (let i = 0; i < sectionTemplates.length; i++) {
      const template = sectionTemplates[i];
      sendEvent("progress", { sectionIndex: i, sectionTitle: template.title, status: "generating" });

      const { systemPrompt, userPrompt } = buildSectionPrompt(
        template, proposalType, prospectName, prospectIndustry, servicePitch,
        painPoints, desiredOutcome, clientContext, kbContext, rfpContextBlock,
        completedSections.slice(-3),
      );

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: { content?: string; speakerNotes?: string };
      try { parsed = JSON.parse(raw); } catch { parsed = { content: "" }; }

      const section: ProposalSection = {
        id: template.id,
        title: template.title,
        content: parsed.content || "",
        order: template.order,
        ...(parsed.speakerNotes ? { speakerNotes: parsed.speakerNotes } : {}),
      };

      completedSections.push(section);
      sendEvent("section", { section, sectionIndex: i, total: sectionTemplates.length });
    }

    if (proposalId) {
      const pid = parseInt(proposalId);
      if (!isNaN(pid)) {
        await db.update(proposalsTable).set({
          sections: completedSections,
          updatedAt: new Date(),
        }).where(and(eq(proposalsTable.id, pid), eq(proposalsTable.clientId, clientId)));
      }
    }

    sendEvent("complete", { sections: completedSections, type: proposalType });
    res.end();
  } catch (err) {
    console.error("Proposal generation error:", err);
    sendEvent("error", { message: err instanceof Error ? err.message : "Generation failed" });
    res.end();
  }
});

router.post("/proposals/analyze-rfp", requireRole("owner", "admin"), llmRateLimit, async (req, res): Promise<void> => {
  const { rfpText } = req.body;

  if (!rfpText || typeof rfpText !== "string") {
    res.status(400).json({ error: "RFP text is required" });
    return;
  }

  if (rfpText.length > 50000) {
    res.status(400).json({ error: "RFP text is too long. Maximum 50,000 characters." });
    return;
  }

  const clientId = req.user!.clientId;
  let clientContext = "";
  try { clientContext = await buildClientContext(clientId); } catch (_e) {}

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4000,
      messages: [
        {
          role: "system",
          content: `You are an expert RFP analyst. Analyze the provided RFP document and extract key requirements, questions, and compliance points. Then generate a structured, point-by-point response outline.
${clientContext}
Format your response as JSON:
{
  "requirements": [{ "id": "req_1", "category": "string", "requirement": "string", "priority": "must|should|nice" }],
  "questions": [{ "id": "q_1", "question": "string", "suggestedAnswer": "string" }],
  "sections": [{ "id": "string", "title": "string", "content": "string", "order": number }],
  "complianceNotes": "string"
}`,
        },
        {
          role: "user",
          content: `Analyze this RFP and generate a comprehensive response:\n\n${rfpText}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { requirements: [], questions: [], sections: [], complianceNotes: "" };
    }

    res.json(parsed);
  } catch (err) {
    console.error("RFP analysis error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "RFP analysis failed" });
  }
});

export default router;
