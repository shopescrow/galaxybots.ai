import { Router, type IRouter } from "express";
import multer from "multer";
import {
  db,
  knowledgeBaseSourcesTable,
  kbSourceDocumentsTable,
  kbSourceChunksTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import {
  extractTextFromFile,
  ingestDocument,
  listDocuments,
  deleteDocument,
} from "../../services/content/knowledge-base";
import { syncSource } from "../../services/content/kb-sync";
import { encryptCredential } from "../../utils/credential-encryption";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    const ext = file.originalname.toLowerCase().split(".").pop() || "";
    if (allowed.includes(file.mimetype) || ["pdf", "docx", "txt", "md"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: PDF, DOCX, TXT, MD"));
    }
  },
});

router.get("/knowledge-base/documents", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const docs = await listDocuments(clientId);
  res.json(docs);
});

router.post(
  "/knowledge-base/documents",
  requireRole("owner", "admin"),
  upload.single("file"),
  async (req, res): Promise<void> => {
    const clientId = req.user!.clientId;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const title = (req.body.title as string) || file.originalname;

    try {
      const text = await extractTextFromFile(
        file.buffer,
        file.originalname,
        file.mimetype,
      );

      if (!text || text.trim().length === 0) {
        res.status(400).json({ error: "Could not extract any text from the uploaded file" });
        return;
      }

      const doc = await ingestDocument({
        clientId,
        title,
        sourceFilename: file.originalname,
        fileType: file.originalname.toLowerCase().split(".").pop() || "unknown",
        text,
      });

      res.status(201).json(doc);
    } catch (err) {
      console.error("Knowledge base upload error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to process document",
      });
    }
  },
);

router.delete("/knowledge-base/documents/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const documentId = Number(req.params.id);

  if (isNaN(documentId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  await deleteDocument(documentId, clientId);
  res.json({ success: true });
});

const VALID_SOURCE_TYPES = ["google_drive", "confluence", "sharepoint", "website"] as const;
const VALID_SCHEDULES = ["hourly", "daily", "weekly"] as const;

router.get("/knowledge-base/sources/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const sources = await db
    .select()
    .from(knowledgeBaseSourcesTable)
    .where(eq(knowledgeBaseSourcesTable.clientId, clientId))
    .orderBy(desc(knowledgeBaseSourcesTable.createdAt));

  const sanitized = sources.map(s => ({
    ...s,
    config: sanitizeConfig(s.sourceType, s.config as Record<string, unknown>),
  }));

  res.json(sanitized);
});

router.get("/knowledge-base/sources/:clientId/:sourceId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const sourceId = Number(req.params.sourceId);
  if (isNaN(clientId) || isNaN(sourceId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [source] = await db
    .select()
    .from(knowledgeBaseSourcesTable)
    .where(and(
      eq(knowledgeBaseSourcesTable.id, sourceId),
      eq(knowledgeBaseSourcesTable.clientId, clientId)
    ));

  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  const documents = await db
    .select({
      id: kbSourceDocumentsTable.id,
      title: kbSourceDocumentsTable.title,
      sourceUrl: kbSourceDocumentsTable.sourceUrl,
      lastModified: kbSourceDocumentsTable.lastModified,
      createdAt: kbSourceDocumentsTable.createdAt,
    })
    .from(kbSourceDocumentsTable)
    .where(eq(kbSourceDocumentsTable.sourceId, sourceId))
    .orderBy(desc(kbSourceDocumentsTable.updatedAt));

  res.json({
    ...source,
    config: sanitizeConfig(source.sourceType, source.config as Record<string, unknown>),
    documents,
  });
});

router.post("/knowledge-base/sources", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { sourceType, name, config, syncSchedule } = req.body;

  if (!sourceType || !name || !config) {
    res.status(400).json({ error: "sourceType, name, and config are required" });
    return;
  }

  if (!VALID_SOURCE_TYPES.includes(sourceType)) {
    res.status(400).json({ error: `Invalid sourceType. Must be one of: ${VALID_SOURCE_TYPES.join(", ")}` });
    return;
  }

  const schedule = syncSchedule && VALID_SCHEDULES.includes(syncSchedule) ? syncSchedule : "daily";

  const encryptedConfig = encryptSensitiveConfig(config);

  const [source] = await db
    .insert(knowledgeBaseSourcesTable)
    .values({
      clientId,
      sourceType,
      name,
      config: encryptedConfig,
      syncSchedule: schedule,
      status: "pending",
    })
    .returning();

  res.status(201).json({
    ...source,
    config: sanitizeConfig(source.sourceType, source.config as Record<string, unknown>),
  });
});

router.put("/knowledge-base/sources/:clientId/:sourceId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const sourceId = Number(req.params.sourceId);
  if (isNaN(clientId) || isNaN(sourceId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { name, config, syncSchedule } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name) updates.name = name;
  if (config) updates.config = encryptSensitiveConfig(config);
  if (syncSchedule && VALID_SCHEDULES.includes(syncSchedule)) updates.syncSchedule = syncSchedule;

  const [updated] = await db
    .update(knowledgeBaseSourcesTable)
    .set(updates)
    .where(and(
      eq(knowledgeBaseSourcesTable.id, sourceId),
      eq(knowledgeBaseSourcesTable.clientId, clientId)
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.json({
    ...updated,
    config: sanitizeConfig(updated.sourceType, updated.config as Record<string, unknown>),
  });
});

router.delete("/knowledge-base/sources/:clientId/:sourceId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const sourceId = Number(req.params.sourceId);
  if (isNaN(clientId) || isNaN(sourceId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [deleted] = await db
    .delete(knowledgeBaseSourcesTable)
    .where(and(
      eq(knowledgeBaseSourcesTable.id, sourceId),
      eq(knowledgeBaseSourcesTable.clientId, clientId)
    ))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  res.json({ success: true });
});

router.post("/knowledge-base/sources/:clientId/:sourceId/sync", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const sourceId = Number(req.params.sourceId);
  if (isNaN(clientId) || isNaN(sourceId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [source] = await db
    .select()
    .from(knowledgeBaseSourcesTable)
    .where(and(
      eq(knowledgeBaseSourcesTable.id, sourceId),
      eq(knowledgeBaseSourcesTable.clientId, clientId)
    ));

  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }

  if (source.status === "syncing") {
    res.status(409).json({ error: "Sync already in progress" });
    return;
  }

  res.json({ message: "Sync started", sourceId });

  syncSource(sourceId).catch(err => {
    console.error(`Manual sync error for source ${sourceId}:`, err);
  });
});

const SENSITIVE_CONFIG_KEYS = ["accessToken", "apiToken", "credential", "password"];

function encryptSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  const encrypted = { ...config };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (encrypted[key] && typeof encrypted[key] === "string" && !(encrypted[key] as string).startsWith("enc:")) {
      encrypted[key] = encryptCredential(encrypted[key] as string);
    }
  }
  return encrypted;
}

function sanitizeConfig(sourceType: string, config: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...config };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (sanitized[key] && typeof sanitized[key] === "string") {
      sanitized[key] = "••••••••";
    }
  }
  return sanitized;
}

export default router;
