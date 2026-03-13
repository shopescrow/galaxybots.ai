import { Router, type IRouter } from "express";
import { db, journalEntriesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetJournalEntriesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/journal", async (req, res): Promise<void> => {
  const date = req.query.date as string | undefined;

  const entries = date
    ? await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.date, date)).orderBy(desc(journalEntriesTable.createdAt))
    : await db.select().from(journalEntriesTable).orderBy(desc(journalEntriesTable.createdAt)).limit(30);

  res.json(GetJournalEntriesResponse.parse(entries));
});

export default router;
