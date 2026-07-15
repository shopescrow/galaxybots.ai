import { db, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Seed the Micro-SaaS builder bot for the Asset Studio.
 * Idempotent: re-running updates the existing row in place rather than
 * creating a duplicate.
 *
 * Note: the Caption Forge example asset that previously shipped with this seed
 * was removed when Caption Forge was retired from the monorepo. The builder bot
 * itself remains active for the Micro-SaaS pipeline.
 */

const BUILDER_BOT = {
  name: "Micro-SaaS Architect",
  title: "Builder of Single-Purpose AI Subscription Tools",
  department: "Asset Studio",
  category: "Creator",
  description:
    "The Micro-SaaS Architect turns a tool concept into a structured product spec — core feature, target user, the AI prompt/logic behind it, the end-user input fields, and a pricing idea — and records it as a Micro-SaaS asset in the Asset Studio. Once a human approves a spec, it produces a reviewable scaffold plan for a standalone web tool wired to the platform's shared AI access. It never ships on its own: humans approve both the spec and the scaffold before anything goes live.",
  responsibilities: [
    "Turn free-form tool concepts into structured Micro-SaaS specs",
    "Record each spec as a Micro-SaaS asset at the idea stage",
    "Produce reviewable scaffold plans for approved specs",
    "Wire generated tools to the shared, governed AI access path",
    "Keep a human in the loop for spec approval and scaffolding",
  ],
  personality:
    "Product-minded, pragmatic, and focused. Prefers one sharp core feature over a sprawling feature list. Designs for a real buyer and a clear price, and respects the approval gate at every step.",
  avatar: "micro-saas-architect",
  declaration:
    "I am the Micro-SaaS Architect. I turn ideas into shippable AI tools — and I never launch without your sign-off.",
  rank: "specialist" as const,
  isAvailable: true,
  isAiGenerated: false,
};

async function seedMicroSaas() {
  const [existingBot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.name, BUILDER_BOT.name))
    .limit(1);

  if (existingBot) {
    console.log(
      `Builder bot "${BUILDER_BOT.name}" already exists (id=${existingBot.id}), skipping insert.`,
    );
  } else {
    const [inserted] = await db.insert(botsTable).values(BUILDER_BOT).returning();
    console.log(`Inserted builder bot "${BUILDER_BOT.name}" (id=${inserted.id}).`);
  }

  console.log("Micro-SaaS seed complete.");
  process.exit(0);
}

seedMicroSaas().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
