import { Router, type IRouter } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/auth";

const router: IRouter = Router();

const PLAN_LINKS: Record<string, string | undefined> = {
  single: process.env["KORT_PAYMENT_LINK_SINGLE"],
  team: process.env["KORT_PAYMENT_LINK_TEAM"],
  enterprise: process.env["KORT_PAYMENT_LINK_ENTERPRISE"],
};

router.get("/billing/links", authenticate, (_req, res): void => {
  res.json({
    provider: "Kort Payments",
    plans: {
      single: {
        name: "Single Director",
        price: 999,
        link: PLAN_LINKS.single || null,
      },
      team: {
        name: "Department Team",
        price: 2999,
        link: PLAN_LINKS.team || null,
      },
      enterprise: {
        name: "Enterprise Command",
        price: 7999,
        link: PLAN_LINKS.enterprise || null,
      },
    },
  });
});

router.get("/billing/status", authenticate, async (req, res): Promise<void> => {
  const [client] = await db
    .select({ plan: clientsTable.plan, status: clientsTable.status })
    .from(clientsTable)
    .where(eq(clientsTable.id, req.user!.clientId));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({ plan: client.plan, status: client.status });
});

router.post(
  "/billing/activate",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { clientId, plan } = req.body;

    if (!clientId || !plan) {
      res.status(400).json({ error: "clientId and plan are required" });
      return;
    }

    const validPlans = ["single", "team", "enterprise"];
    if (!validPlans.includes(plan)) {
      res.status(400).json({ error: `plan must be one of: ${validPlans.join(", ")}` });
      return;
    }

    const [updated] = await db
      .update(clientsTable)
      .set({ plan, status: "active" })
      .where(eq(clientsTable.id, Number(clientId)))
      .returning({ id: clientsTable.id, plan: clientsTable.plan, status: clientsTable.status });

    if (!updated) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json({ success: true, client: updated });
  }
);

export default router;
