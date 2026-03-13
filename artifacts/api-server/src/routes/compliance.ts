import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, platformComplianceTable, clientComplianceRequirementsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  CreateClientComplianceBody,
  UpdateClientComplianceBody,
  ListClientComplianceParams,
  CreateClientComplianceParams,
  UpdateClientComplianceParams,
  DeleteClientComplianceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const COMPLIANCE_API_KEY = process.env["COMPLIANCE_API_KEY"] || "";

const InboundComplianceBody = z.object({
  standardName: z.string().min(1).max(500),
  category: z.string().min(1).max(200),
  status: z.enum(["compliant", "non_compliant", "pending", "expired"]),
  certificationId: z.string().max(200).optional(),
  issuedBy: z.string().max(500).optional(),
  details: z.string().max(5000).optional(),
  expiresAt: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      const d = new Date(val);
      return !isNaN(d.getTime());
    },
    { message: "expiresAt must be a valid ISO 8601 date string" }
  ),
});

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!COMPLIANCE_API_KEY) {
    res.status(503).json({ error: "Compliance API key not configured" });
    return;
  }
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== COMPLIANCE_API_KEY) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}

router.post("/compliance/inbound", requireApiKey, async (req, res): Promise<void> => {
  try {
    const parsed = InboundComplianceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { standardName, category, status, certificationId, issuedBy, details, expiresAt } = parsed.data;

    const [record] = await db.insert(platformComplianceTable).values({
      standardName,
      category,
      status,
      certificationId: certificationId ?? null,
      issuedBy: issuedBy ?? null,
      details: details ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    res.status(201).json(record);
  } catch (err) {
    console.error("Error creating compliance record:", err);
    res.status(500).json({ error: "Failed to create compliance record" });
  }
});

router.get("/compliance/platform", async (_req, res): Promise<void> => {
  try {
    const records = await db.select().from(platformComplianceTable).orderBy(desc(platformComplianceTable.createdAt));
    res.json(records);
  } catch (err) {
    console.error("Error fetching compliance records:", err);
    res.status(500).json({ error: "Failed to fetch compliance records" });
  }
});

router.get("/compliance/platform/config", async (_req, res): Promise<void> => {
  res.json({
    endpointUrl: "/api/compliance/inbound",
    method: "POST",
    apiKeyHeader: "x-api-key",
    apiKeyConfigured: !!COMPLIANCE_API_KEY,
    payloadExample: {
      standardName: "SOC 2 Type II",
      category: "security",
      status: "compliant",
      certificationId: "CERT-2025-001",
      issuedBy: "Auditor Inc.",
      details: "Annual audit passed",
      expiresAt: "2026-03-01T00:00:00Z",
    },
  });
});

router.get("/compliance/client/:clientId", async (req, res): Promise<void> => {
  const params = ListClientComplianceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const requirements = await db
      .select()
      .from(clientComplianceRequirementsTable)
      .where(eq(clientComplianceRequirementsTable.clientId, params.data.clientId))
      .orderBy(desc(clientComplianceRequirementsTable.createdAt));

    res.json(requirements);
  } catch (err) {
    console.error("Error fetching client compliance:", err);
    res.status(500).json({ error: "Failed to fetch client compliance requirements" });
  }
});

router.post("/compliance/client/:clientId", async (req, res): Promise<void> => {
  const params = CreateClientComplianceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateClientComplianceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [record] = await db.insert(clientComplianceRequirementsTable).values({
      clientId: params.data.clientId,
      name: parsed.data.name,
      category: parsed.data.category,
      status: parsed.data.status ?? "pending",
      notes: parsed.data.notes ?? null,
    }).returning();

    res.status(201).json(record);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "23503") {
      res.status(400).json({ error: "Client not found" });
      return;
    }
    console.error("Error creating client compliance requirement:", err);
    res.status(500).json({ error: "Failed to create client compliance requirement" });
  }
});

router.put("/compliance/client/:clientId/:id", async (req, res): Promise<void> => {
  const params = UpdateClientComplianceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientComplianceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const updates: {
      updatedAt: Date;
      name?: string;
      category?: string;
      status?: string;
      notes?: string;
    } = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.category !== undefined) updates.category = parsed.data.category;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

    const [record] = await db
      .update(clientComplianceRequirementsTable)
      .set(updates)
      .where(
        and(
          eq(clientComplianceRequirementsTable.id, params.data.id),
          eq(clientComplianceRequirementsTable.clientId, params.data.clientId),
        )
      )
      .returning();

    if (!record) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }

    res.json(record);
  } catch (err) {
    console.error("Error updating client compliance requirement:", err);
    res.status(500).json({ error: "Failed to update client compliance requirement" });
  }
});

router.delete("/compliance/client/:clientId/:id", async (req, res): Promise<void> => {
  const params = DeleteClientComplianceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [deleted] = await db
      .delete(clientComplianceRequirementsTable)
      .where(
        and(
          eq(clientComplianceRequirementsTable.id, params.data.id),
          eq(clientComplianceRequirementsTable.clientId, params.data.clientId),
        )
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting client compliance requirement:", err);
    res.status(500).json({ error: "Failed to delete client compliance requirement" });
  }
});

export default router;
