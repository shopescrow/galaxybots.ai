import { Router, type IRouter } from "express";
import multer from "multer";
import { requireRole } from "../middleware/auth";
import {
  extractTextFromFile,
  ingestDocument,
  listDocuments,
  deleteDocument,
} from "../services/knowledge-base";

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

export default router;
