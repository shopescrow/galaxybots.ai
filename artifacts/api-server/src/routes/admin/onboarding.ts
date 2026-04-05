import { Router, type IRouter } from "express";
import { db, usersTable, DEFAULT_ONBOARDING, type OnboardingState } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../../middleware/auth";

const BOOLEAN_KEYS: ReadonlyArray<keyof Pick<OnboardingState,
  "companyProfile" | "firstClient" | "industry" | "integrations" | "firstMission" | "dismissed"
>> = ["companyProfile", "firstClient", "industry", "integrations", "firstMission", "dismissed"];

const STEP_KEYS: ReadonlyArray<keyof Pick<OnboardingState,
  "companyProfile" | "firstClient" | "industry" | "integrations" | "firstMission"
>> = ["companyProfile", "firstClient", "industry", "integrations", "firstMission"];

const STARTED_AT_KEYS: ReadonlyArray<keyof Pick<OnboardingState,
  "companyProfileStartedAt" | "firstClientStartedAt" | "industryStartedAt" | "integrationsStartedAt" | "firstMissionStartedAt"
>> = ["companyProfileStartedAt", "firstClientStartedAt", "industryStartedAt", "integrationsStartedAt", "firstMissionStartedAt"];

const router: IRouter = Router();

router.get("/onboarding", authenticate, async (req, res): Promise<void> => {
  const [user] = await db
    .select({ onboarding: usersTable.onboarding })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user.onboarding ?? DEFAULT_ONBOARDING);
});

router.patch("/onboarding", authenticate, async (req, res): Promise<void> => {
  const [user] = await db
    .select({ onboarding: usersTable.onboarding })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const current: OnboardingState = (user.onboarding as OnboardingState) ?? { ...DEFAULT_ONBOARDING };
  const updates = req.body;

  const merged: OnboardingState = { ...current };
  for (const key of BOOLEAN_KEYS) {
    if (typeof updates[key] === "boolean") {
      merged[key] = updates[key];
    }
  }

  for (const key of STARTED_AT_KEYS) {
    if (typeof updates[key] === "string") {
      merged[key] = updates[key];
    }
  }

  const allComplete = STEP_KEYS.every((s) => merged[s]);
  if (allComplete && !merged.completedAt) {
    merged.completedAt = new Date().toISOString();
  }

  const [updated] = await db
    .update(usersTable)
    .set({ onboarding: merged })
    .where(eq(usersTable.id, req.user!.userId))
    .returning({ onboarding: usersTable.onboarding });

  res.json(updated.onboarding);
});

export default router;
