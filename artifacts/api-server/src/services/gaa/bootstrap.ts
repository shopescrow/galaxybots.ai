import { db, gaaGoalsTable } from "@workspace/db";
import { seedConstitution } from "./constitution";

// ---------------------------------------------------------------------------
// Bootstrap the GAA: seed the constitution and the standing (evergreen)
// objectives the agent pursues on behalf of the platform. Idempotent.
// ---------------------------------------------------------------------------

interface SeedGoal {
  title: string;
  description: string;
  mode: "autonomous" | "agenda" | "mission";
  temporalTier: "evergreen" | "time_boxed" | "reactive";
  priority: number;
  purpose: string;
  costEnvelopeCents: number;
}

const SEED_GOALS: SeedGoal[] = [
  {
    title: "Continuously improve client outcomes",
    description:
      "Monitor client health signals and surface high-leverage opportunities to improve retention and ROI.",
    mode: "autonomous",
    temporalTier: "evergreen",
    priority: 1,
    purpose: "service_delivery",
    costEnvelopeCents: 5000,
  },
  {
    title: "Maintain platform compliance posture",
    description:
      "Audit autonomous actions for KiloPro / privacy compliance and keep the constitution aligned with policy.",
    mode: "autonomous",
    temporalTier: "evergreen",
    priority: 1,
    purpose: "compliance",
    costEnvelopeCents: 3000,
  },
  {
    title: "Detect and triage platform anomalies",
    description:
      "Watch for anomalous bot behaviour and operational risks; escalate anything that needs human judgement.",
    mode: "autonomous",
    temporalTier: "evergreen",
    priority: 2,
    purpose: "security",
    costEnvelopeCents: 3000,
  },
  {
    title: "Grow platform intelligence",
    description:
      "Consolidate lessons across clients into durable memory and feed them back into future planning.",
    mode: "autonomous",
    temporalTier: "evergreen",
    priority: 2,
    purpose: "platform_improvement",
    costEnvelopeCents: 2000,
  },
];

export async function bootstrapGaa(): Promise<{
  constitutionSeeded: number;
  goalsSeeded: number;
}> {
  const constitutionSeeded = await seedConstitution();

  const existing = await db.select().from(gaaGoalsTable).limit(1);
  let goalsSeeded = 0;
  if (existing.length === 0) {
    await db.insert(gaaGoalsTable).values(
      SEED_GOALS.map((g) => ({
        title: g.title,
        description: g.description,
        mode: g.mode,
        temporalTier: g.temporalTier,
        status: "active" as const,
        priority: g.priority,
        purpose: g.purpose,
        costEnvelopeCents: g.costEnvelopeCents,
        generatedBy: "bootstrap",
      })),
    );
    goalsSeeded = SEED_GOALS.length;
  }

  if (constitutionSeeded > 0 || goalsSeeded > 0) {
    console.log(
      `[gaa] Bootstrap complete: ${constitutionSeeded} principles, ${goalsSeeded} evergreen goals seeded.`,
    );
  }
  return { constitutionSeeded, goalsSeeded };
}
