import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { db, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../../middleware/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const VALID_ACCENT_COLORS = ["purple", "cyan", "gold", "green", "orange", "red", "blue", "slate"];
const VALID_FONT_SIZES = ["sm", "md", "lg", "xl"];

const NOTIFICATION_BOOL_FIELDS = [
  "pushEnabled",
  "notifyApprovals",
  "notifyBotActions",
  "notifyCostAlerts",
  "notifyScheduler",
  "notifySystem",
] as const;

async function getOrCreatePreferences(userId: number) {
  const [existing] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));

  if (existing) return existing;

  const [created] = await db
    .insert(userPreferencesTable)
    .values({ userId })
    .returning();

  return created;
}

function sanitizePrefsResponse(prefs: Record<string, unknown>) {
  const { logoUrl, ...rest } = prefs;
  return { ...rest, hasLogo: !!logoUrl };
}

router.get("/user/preferences", authenticate, async (req, res): Promise<void> => {
  const prefs = await getOrCreatePreferences(req.user!.userId);
  res.json(sanitizePrefsResponse(prefs));
});

router.patch("/user/preferences", authenticate, async (req, res): Promise<void> => {
  const { accentColor, fontSize, showBillingWidget } = req.body;

  const updates: Record<string, unknown> = {};

  if (accentColor !== undefined) {
    if (!VALID_ACCENT_COLORS.includes(accentColor)) {
      res.status(400).json({ error: `accentColor must be one of: ${VALID_ACCENT_COLORS.join(", ")}` });
      return;
    }
    updates.accentColor = accentColor;
  }

  if (fontSize !== undefined) {
    if (!VALID_FONT_SIZES.includes(fontSize)) {
      res.status(400).json({ error: `fontSize must be one of: ${VALID_FONT_SIZES.join(", ")}` });
      return;
    }
    updates.fontSize = fontSize;
  }

  if (showBillingWidget !== undefined) {
    updates.showBillingWidget = Boolean(showBillingWidget);
  }

  for (const field of NOTIFICATION_BOOL_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = Boolean(req.body[field]);
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  await getOrCreatePreferences(req.user!.userId);

  const [updated] = await db
    .update(userPreferencesTable)
    .set(updates)
    .where(eq(userPreferencesTable.userId, req.user!.userId))
    .returning();

  res.json(sanitizePrefsResponse(updated));
});

router.post("/user/preferences/logo", authenticate, async (req, res): Promise<void> => {
  const { objectPath } = req.body;

  if (!objectPath || typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "A valid objectPath is required (must start with /objects/)" });
    return;
  }

  const ownerPrefix = `user-${req.user!.userId}`;
  if (!objectStorageService.isObjectOwnedBy(objectPath, ownerPrefix)) {
    res.status(403).json({ error: "Object does not belong to this user" });
    return;
  }

  try {
    await objectStorageService.getObjectEntityFile(objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Object does not exist" });
      return;
    }
    res.status(500).json({ error: "Failed to verify object" });
    return;
  }

  await getOrCreatePreferences(req.user!.userId);

  const [updated] = await db
    .update(userPreferencesTable)
    .set({ logoUrl: objectPath })
    .where(eq(userPreferencesTable.userId, req.user!.userId))
    .returning();

  res.json(sanitizePrefsResponse(updated));
});

router.delete("/user/preferences/logo", authenticate, async (req, res): Promise<void> => {
  await getOrCreatePreferences(req.user!.userId);

  const [updated] = await db
    .update(userPreferencesTable)
    .set({ logoUrl: null })
    .where(eq(userPreferencesTable.userId, req.user!.userId))
    .returning();

  res.json(updated);
});

router.get("/user/preferences/logo/serve", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const [prefs] = await db
    .select({ logoUrl: userPreferencesTable.logoUrl })
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));

  if (!prefs?.logoUrl) {
    res.status(404).json({ error: "No logo found" });
    return;
  }

  const ownerPrefix = `user-${userId}`;
  if (!objectStorageService.isObjectOwnedBy(prefs.logoUrl, ownerPrefix)) {
    res.status(403).json({ error: "Logo ownership mismatch" });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(prefs.logoUrl);
    const response = await objectStorageService.downloadObject(objectFile, 3600);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Logo file not found" });
      return;
    }
    console.error("Error serving logo:", error);
    res.status(500).json({ error: "Failed to serve logo" });
  }
});

export default router;
