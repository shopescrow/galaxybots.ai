import { Router, type IRouter } from "express";
import { db, documentsTable, botsTable, clientBotsTable } from "@workspace/db";
import { eq, desc, and, ilike, SQL } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { DocumentVersion } from "@workspace/db";
import { Packer, Document as DocxDocument, Paragraph, TextRun, HeadingLevel } from "docx";

const VALID_STATUSES = ["draft", "published", "archived"] as const;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function validateBotOwnership(botId: number, clientId: number): Promise<boolean> {
  const [assignment] = await db
    .select()
    .from(clientBotsTable)
    .where(and(eq(clientBotsTable.botId, botId), eq(clientBotsTable.clientId, clientId)));
  return !!assignment;
}

const router: IRouter = Router();

router.get("/documents", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { botId, department, search } = req.query;

  const conditions: SQL[] = [eq(documentsTable.clientId, clientId)];
  if (botId) conditions.push(eq(documentsTable.botId, parseInt(botId as string)));
  if (department) conditions.push(eq(documentsTable.department, department as string));
  if (search) conditions.push(ilike(documentsTable.title, `%${search}%`));

  const docs = await db
    .select({
      id: documentsTable.id,
      clientId: documentsTable.clientId,
      botId: documentsTable.botId,
      sessionId: documentsTable.sessionId,
      title: documentsTable.title,
      department: documentsTable.department,
      status: documentsTable.status,
      currentVersion: documentsTable.currentVersion,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
      botName: botsTable.name,
    })
    .from(documentsTable)
    .leftJoin(botsTable, eq(documentsTable.botId, botsTable.id))
    .where(and(...conditions))
    .orderBy(desc(documentsTable.updatedAt))
    .limit(100);

  res.json(docs);
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const [doc] = await db
    .select({
      id: documentsTable.id,
      clientId: documentsTable.clientId,
      botId: documentsTable.botId,
      sessionId: documentsTable.sessionId,
      title: documentsTable.title,
      content: documentsTable.content,
      department: documentsTable.department,
      status: documentsTable.status,
      versionHistory: documentsTable.versionHistory,
      currentVersion: documentsTable.currentVersion,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
      botName: botsTable.name,
    })
    .from(documentsTable)
    .leftJoin(botsTable, eq(documentsTable.botId, botsTable.id))
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));

  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(doc);
});

router.post("/documents", async (req, res): Promise<void> => {
  const { title, content, botId, sessionId, department } = req.body;
  if (!title || typeof title !== "string") { res.status(400).json({ error: "Title is required" }); return; }
  if (title.length > 500) { res.status(400).json({ error: "Title too long" }); return; }

  if (botId) {
    const validBot = await validateBotOwnership(botId, req.user!.clientId);
    if (!validBot) { res.status(403).json({ error: "Bot not assigned to your organization" }); return; }
  }

  const [doc] = await db.insert(documentsTable).values({
    clientId: req.user!.clientId,
    title,
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
    botId: botId || null,
    sessionId: sessionId || null,
    department: department || null,
    status: "draft",
    versionHistory: [],
    currentVersion: 1,
  }).returning();

  res.status(201).json(doc);
});

router.put("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const [existing] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!existing) { res.status(404).json({ error: "Document not found" }); return; }

  const { title, content, status } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  if (title && typeof title === "string" && title.length > 500) {
    res.status(400).json({ error: "Title too long" });
    return;
  }

  const history: DocumentVersion[] = [...(existing.versionHistory as DocumentVersion[] || [])];
  history.push({
    version: existing.currentVersion,
    content: existing.content,
    title: existing.title,
    editedBy: "user",
    createdAt: new Date().toISOString(),
  });

  const [updated] = await db.update(documentsTable).set({
    title: title || existing.title,
    content: content || existing.content,
    status: status || existing.status,
    versionHistory: history,
    currentVersion: existing.currentVersion + 1,
    updatedAt: new Date(),
  }).where(eq(documentsTable.id, id)).returning();

  res.json(updated);
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const [deleted] = await db.delete(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }
  res.json({ success: true });
});

router.post("/documents/:id/revise", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const { instruction } = req.body;
  if (!instruction || typeof instruction !== "string") { res.status(400).json({ error: "Instruction is required" }); return; }
  if (instruction.length > 2000) { res.status(400).json({ error: "Instruction too long" }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  let botName = "Document Assistant";
  let botPersonality = "Professional, detail-oriented writer";
  if (doc.botId) {
    const [bot] = await db
      .select()
      .from(botsTable)
      .innerJoin(clientBotsTable, and(
        eq(clientBotsTable.botId, botsTable.id),
        eq(clientBotsTable.clientId, req.user!.clientId)
      ))
      .where(eq(botsTable.id, doc.botId));
    if (bot) {
      botName = bot.bots.name;
      botPersonality = bot.bots.personality;
    }
  }

  const docText = extractTextFromTiptap(doc.content);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4000,
      messages: [
        {
          role: "system",
          content: `You are ${botName}. ${botPersonality}. You are revising a document based on the user's instructions. Return ONLY the revised document content as plain text with markdown formatting. Do not include any meta-commentary.`,
        },
        {
          role: "user",
          content: `Here is the current document titled "${doc.title}":\n\n${docText}\n\nRevision instruction: ${instruction}\n\nPlease provide the revised document.`,
        },
      ],
    });

    const revisedText = completion.choices[0]?.message?.content ?? docText;
    const revisedContent = markdownToTiptap(revisedText);

    const history: DocumentVersion[] = [...(doc.versionHistory as DocumentVersion[] || [])];
    history.push({
      version: doc.currentVersion,
      content: doc.content,
      title: doc.title,
      editedBy: `bot:${botName}`,
      createdAt: new Date().toISOString(),
    });

    const [updated] = await db.update(documentsTable).set({
      content: revisedContent,
      versionHistory: history,
      currentVersion: doc.currentVersion + 1,
      updatedAt: new Date(),
    }).where(eq(documentsTable.id, id)).returning();

    res.json({ document: updated, revisedBy: botName });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Revision failed" });
  }
});

router.post("/documents/:id/restore-version", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const { version } = req.body;
  if (typeof version !== "number") { res.status(400).json({ error: "Version number required" }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const history = doc.versionHistory as DocumentVersion[] || [];
  const target = history.find((v) => v.version === version);
  if (!target) { res.status(404).json({ error: "Version not found" }); return; }

  history.push({
    version: doc.currentVersion,
    content: doc.content,
    title: doc.title,
    editedBy: "user",
    createdAt: new Date().toISOString(),
  });

  const [updated] = await db.update(documentsTable).set({
    title: target.title,
    content: target.content,
    versionHistory: history,
    currentVersion: doc.currentVersion + 1,
    updatedAt: new Date(),
  }).where(eq(documentsTable.id, id)).returning();

  res.json(updated);
});

router.get("/documents/:id/export/html", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const html = tiptapToHtml(doc.content);
  const safeTitle = escapeHtml(doc.title);
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6}h1,h2,h3{margin-top:1.5em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}</style></head><body><h1>${safeTitle}</h1>${html}</body></html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.html"`);
  res.send(fullHtml);
});

router.get("/documents/:id/export/docx", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const paragraphs = tiptapToDocxParagraphs(doc.content);

  const docxDoc = new DocxDocument({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }),
        ...paragraphs,
      ],
    }],
  });

  const buffer = await Packer.toBuffer(docxDoc);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`);
  res.send(Buffer.from(buffer));
});

router.post("/documents/:id/push-notion", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const { getTool } = await import("../tools/registry");
  const createDocTool = getTool("create_document");
  if (!createDocTool) { res.status(500).json({ error: "Notion tool not available" }); return; }

  const text = extractPlainText(doc.content);
  const result = await createDocTool.execute(
    { title: doc.title, content: text },
    { clientId: req.user!.clientId }
  );

  res.json(result);
});

router.post("/documents/:id/email", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid document ID" }); return; }

  const { to, subject } = req.body;
  if (!to || typeof to !== "string") { res.status(400).json({ error: "Recipient email required" }); return; }

  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.clientId, req.user!.clientId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const { getTool } = await import("../tools/registry");
  const emailTool = getTool("send_email");
  if (!emailTool) { res.status(500).json({ error: "Email tool not available" }); return; }

  const text = extractPlainText(doc.content);
  const result = await emailTool.execute(
    { to, subject: subject || doc.title, body: text },
    { clientId: req.user!.clientId }
  );

  res.json(result);
});

function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.text) return n.text;
  if (n.content && Array.isArray(n.content)) {
    return n.content.map(extractPlainText).join(n.type === "paragraph" ? "\n" : "");
  }
  return "";
}

function extractTextFromTiptap(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.text) return n.text;
  if (n.content && Array.isArray(n.content)) {
    return n.content.map(extractTextFromTiptap).join(n.type === "paragraph" ? "\n" : "");
  }
  return "";
}

function markdownToTiptap(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line: string) => {
      if (line.startsWith("# ")) {
        return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: line.slice(2) }] };
      }
      if (line.startsWith("## ")) {
        return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: line.slice(3) }] };
      }
      if (line.startsWith("### ")) {
        return { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: line.slice(4) }] };
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: line.slice(2) }] }] }],
        };
      }
      return { type: "paragraph", content: line ? [{ type: "text", text: line }] : [] };
    }),
  };
}

function tiptapToHtml(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown>; marks?: Array<{ type: string }> };

  if (n.type === "text") {
    let text = escapeHtml(n.text || "");
    if (n.marks) {
      for (const mark of n.marks) {
        if (mark.type === "bold") text = `<strong>${text}</strong>`;
        if (mark.type === "italic") text = `<em>${text}</em>`;
        if (mark.type === "underline") text = `<u>${text}</u>`;
        if (mark.type === "code") text = `<code>${text}</code>`;
      }
    }
    return text;
  }

  const children = n.content ? n.content.map(tiptapToHtml).join("") : "";

  switch (n.type) {
    case "doc": return children;
    case "paragraph": return `<p>${children}</p>`;
    case "heading": {
      const level = Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6);
      return `<h${level}>${children}</h${level}>`;
    }
    case "bulletList": return `<ul>${children}</ul>`;
    case "orderedList": return `<ol>${children}</ol>`;
    case "listItem": return `<li>${children}</li>`;
    case "codeBlock": return `<pre><code>${children}</code></pre>`;
    case "table": return `<table>${children}</table>`;
    case "tableRow": return `<tr>${children}</tr>`;
    case "tableCell": return `<td>${children}</td>`;
    case "tableHeader": return `<th>${children}</th>`;
    case "blockquote": return `<blockquote>${children}</blockquote>`;
    default: return children;
  }
}

function tiptapToDocxParagraphs(node: unknown): Paragraph[] {
  if (!node || typeof node !== "object") return [];
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown>; marks?: Array<{ type: string }> };

  if (n.type === "doc" && n.content) {
    return n.content.flatMap((child) => tiptapToDocxParagraphs(child));
  }

  if (n.type === "heading") {
    const level = (n.attrs?.level as number) || 1;
    const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
    };
    return [new Paragraph({
      heading: headingMap[level] || HeadingLevel.HEADING_1,
      children: extractTextRuns(n.content || []),
    })];
  }

  if (n.type === "paragraph") {
    return [new Paragraph({ children: extractTextRuns(n.content || []) })];
  }

  if (n.type === "bulletList" || n.type === "orderedList") {
    return (n.content || []).flatMap((item) => {
      const itemNode = item as { content?: unknown[] };
      return (itemNode.content || []).flatMap((p) => tiptapToDocxParagraphs(p));
    });
  }

  if (n.type === "codeBlock") {
    const text = extractPlainText(n);
    return [new Paragraph({ children: [new TextRun({ text, font: "Courier New", size: 20 })] })];
  }

  if (n.content) {
    return n.content.flatMap((child) => tiptapToDocxParagraphs(child));
  }

  return [];
}

function extractTextRuns(content: unknown[]): TextRun[] {
  return content.map((child) => {
    const c = child as { text?: string; marks?: Array<{ type: string }> };
    const bold = c.marks?.some((m) => m.type === "bold") || false;
    const italic = c.marks?.some((m) => m.type === "italic") || false;
    return new TextRun({ text: c.text || "", bold, italics: italic });
  });
}

export default router;
