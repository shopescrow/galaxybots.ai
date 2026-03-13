import { Router, type IRouter } from "express";
import { db, clientIntegrationsTable, clientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptCredential } from "../utils/credential-encryption";

const router: IRouter = Router();

const REDACTED = "••••••••";

const VALID_SERVICES = ["gmail", "google_calendar", "hubspot", "notion"] as const;

async function verifyClientOwnership(clientId: number): Promise<boolean> {
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return !!client;
}

router.get("/client-integrations/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  if (!(await verifyClientOwnership(clientId))) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const integrations = await db
    .select()
    .from(clientIntegrationsTable)
    .where(eq(clientIntegrationsTable.clientId, clientId));

  const redacted = integrations.map((i) => ({
    ...i,
    credential: REDACTED,
  }));

  res.json(redacted);
});

router.post("/client-integrations", async (req, res): Promise<void> => {
  const { clientId, service, credential, label } = req.body;

  if (!clientId || !service || !credential) {
    res.status(400).json({ error: "clientId, service, and credential are required" });
    return;
  }

  if (!VALID_SERVICES.includes(service)) {
    res.status(400).json({ error: `Invalid service. Must be one of: ${VALID_SERVICES.join(", ")}` });
    return;
  }

  const numericClientId = Number(clientId);
  if (!(await verifyClientOwnership(numericClientId))) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const encrypted = encryptCredential(credential);

  const [existing] = await db
    .select()
    .from(clientIntegrationsTable)
    .where(and(
      eq(clientIntegrationsTable.clientId, numericClientId),
      eq(clientIntegrationsTable.service, service)
    ));

  if (existing) {
    const [updated] = await db
      .update(clientIntegrationsTable)
      .set({ credential: encrypted, label: label ?? null, status: "connected" })
      .where(eq(clientIntegrationsTable.id, existing.id))
      .returning();
    res.json({ ...updated, credential: REDACTED });
  } else {
    const [created] = await db
      .insert(clientIntegrationsTable)
      .values({
        clientId: numericClientId,
        service,
        credential: encrypted,
        label: label ?? null,
        status: "connected",
      })
      .returning();
    res.status(201).json({ ...created, credential: REDACTED });
  }
});

router.delete("/client-integrations/:clientId/:id", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const id = Number(req.params.id);
  if (isNaN(clientId) || isNaN(id)) {
    res.status(400).json({ error: "Invalid client ID or integration ID" });
    return;
  }

  if (!(await verifyClientOwnership(clientId))) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [deleted] = await db
    .delete(clientIntegrationsTable)
    .where(and(
      eq(clientIntegrationsTable.id, id),
      eq(clientIntegrationsTable.clientId, clientId)
    ))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Integration not found for this client" });
    return;
  }

  res.json({ success: true });
});

export default router;
