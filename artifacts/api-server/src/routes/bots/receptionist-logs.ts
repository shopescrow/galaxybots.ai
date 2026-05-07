import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, receptionistConfigsTable, callLogsTable, callImprovementRunsTable, clientsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

async function validateClientExists(req: Request, res: Response, next: NextFunction): Promise<void> {
  let clientId = Number(req.params.clientId || req.body?.clientId || req.query?.clientId);

  if (!clientId || isNaN(clientId)) {
    const configId = Number(req.body?.configId || req.query?.configId || req.params?.configId);
    if (configId && !isNaN(configId)) {
      const [config] = await db
        .select({ clientId: receptionistConfigsTable.clientId })
        .from(receptionistConfigsTable)
        .where(eq(receptionistConfigsTable.id, configId));
      if (config) {
        clientId = config.clientId;
      }
    }
  }

  if (!clientId || isNaN(clientId)) {
    res.status(400).json({ error: "Valid clientId or configId is required" });
    return;
  }
  const [client] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  next();
}

router.get("/receptionist/call-logs", validateClientExists, async (req, res): Promise<void> => {
  const {
    configId,
    clientId,
    direction,
    crmSynced,
    startDate,
    endDate,
    page = "1",
    limit = "20",
  } = req.query;

  if (!configId && !clientId) {
    res.status(400).json({ error: "configId or clientId query parameter is required for tenant scoping" });
    return;
  }

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  let query = db.select().from(callLogsTable).$dynamic();

  const conditions = [];

  if (configId) {
    conditions.push(eq(callLogsTable.configId, Number(configId)));
  } else if (clientId) {
    const [tenantConfig] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.clientId, Number(clientId)));
    if (!tenantConfig) {
      res.json({ data: [], pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 } });
      return;
    }
    conditions.push(eq(callLogsTable.configId, tenantConfig.id));
  }
  if (direction) {
    conditions.push(eq(callLogsTable.direction, String(direction)));
  }
  if (crmSynced !== undefined) {
    conditions.push(eq(callLogsTable.crmSynced, crmSynced === "true"));
  }
  if (startDate) {
    conditions.push(gte(callLogsTable.createdAt, new Date(String(startDate))));
  }
  if (endDate) {
    conditions.push(lte(callLogsTable.createdAt, new Date(String(endDate))));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const logs = await query
    .orderBy(desc(callLogsTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json({
    data: logs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countResult?.count || 0,
      totalPages: Math.ceil((countResult?.count || 0) / limitNum),
    },
  });
});

router.get("/receptionist/improvement-history/:configId", async (req, res): Promise<void> => {
  const configId = Number(req.params.configId);
  if (isNaN(configId)) {
    res.status(400).json({ error: "Invalid config ID" });
    return;
  }

  const [config] = await db.select({ id: receptionistConfigsTable.id, clientId: receptionistConfigsTable.clientId }).from(receptionistConfigsTable).where(eq(receptionistConfigsTable.id, configId));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }

  const runs = await db
    .select()
    .from(callImprovementRunsTable)
    .where(eq(callImprovementRunsTable.configId, configId))
    .orderBy(desc(callImprovementRunsTable.createdAt))
    .limit(10);

  res.json(runs);
});

export default router;
