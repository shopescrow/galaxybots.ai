import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { authenticate } from "../middleware/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_CONTENT_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif",
  "application/pdf", "text/plain", "text/csv",
];
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

router.post("/storage/uploads/request-url", authenticate, async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body;

  if (!name || !contentType) {
    res.status(400).json({ error: "name and contentType are required" });
    return;
  }

  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    res.status(400).json({ error: `Content type '${contentType}' is not allowed` });
    return;
  }

  if (size && size > MAX_UPLOAD_SIZE) {
    res.status(400).json({ error: `File size exceeds maximum of ${MAX_UPLOAD_SIZE / 1024 / 1024}MB` });
    return;
  }

  try {
    const ownerPrefix = `user-${req.user!.userId}`;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(ownerPrefix);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Error serving public object:", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

router.get("/storage/objects/*path", authenticate, async (_req: Request, res: Response) => {
  res.status(403).json({ error: "Direct object access is not allowed. Use dedicated serving endpoints." });
});

export default router;
