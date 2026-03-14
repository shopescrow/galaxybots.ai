import { Router, type IRouter } from "express";
import { db, platformAuditLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

router.get("/audit", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const clientId = req.user!.clientId;

  const logs = await db
    .select()
    .from(platformAuditLogTable)
    .where(eq(platformAuditLogTable.clientId, clientId))
    .orderBy(desc(platformAuditLogTable.createdAt))
    .limit(Math.min(limit, 500));

  res.json(logs);
});

export default router;
