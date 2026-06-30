import { db } from "./index";
  import { subscriptionPlansTable } from "./schema";

  async function seedPlans() {
    await db
      .insert(subscriptionPlansTable)
      .values([
        {
          tier: "single",
          monthlyPrice: "999.00",
          includedCredits: 50000,
          overageRatePerCredit: "0.0200",
          isActive: true,
        },
        {
          tier: "team",
          monthlyPrice: "2999.00",
          includedCredits: 200000,
          overageRatePerCredit: "0.0150",
          isActive: true,
        },
        {
          tier: "enterprise",
          monthlyPrice: "7999.00",
          includedCredits: 1000000,
          overageRatePerCredit: "0.0100",
          isActive: true,
        },
      ])
      .onConflictDoUpdate({
        target: subscriptionPlansTable.tier,
        set: {
          monthlyPrice: subscriptionPlansTable.monthlyPrice,
          includedCredits: subscriptionPlansTable.includedCredits,
          overageRatePerCredit: subscriptionPlansTable.overageRatePerCredit,
          isActive: subscriptionPlansTable.isActive,
        },
      });
    console.log("✓ Subscription plans seeded");
    process.exit(0);
  }

  seedPlans().catch((e) => { console.error(e); process.exit(1); });
  