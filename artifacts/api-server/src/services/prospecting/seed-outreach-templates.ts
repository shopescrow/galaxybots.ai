import { db, prospectOutreachTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export async function seedDefaultOutreachTemplates() {
  try {
    const existingDefaults = await db
      .select()
      .from(prospectOutreachTemplatesTable)
      .where(eq(prospectOutreachTemplatesTable.isDefault, true));

    const hasEmailDefault = existingDefaults.some(t => t.channel === "email");
    const hasSmsDefault = existingDefaults.some(t => t.channel === "sms");

    if (!hasEmailDefault) {
      await db.insert(prospectOutreachTemplatesTable).values({
        name: "AEO Service Pitch",
        channel: "email",
        subject: "Boost Your AI Visibility with {{companyName}} - GalaxyBots AEO",
        body: `Hi there,

I came across {{companyName}} ({{domain}}) and noticed a great opportunity to improve your visibility in AI-powered search results.

At GalaxyBots, we specialize in AI Engine Optimization (AEO) — helping businesses like yours appear prominently when customers ask AI assistants for recommendations.

Our {{botName}} has identified your business as a strong candidate for AEO services. Here is what we can do:

- Optimize your online presence for AI-powered search
- Monitor and improve your AI visibility scores
- Provide actionable recommendations for better AI discoverability

Would you be open to a quick 15-minute call to explore how AEO could benefit {{companyName}}?

Best regards,
The GalaxyBots Team`,
        isDefault: true,
        createdBy: "Sales Bot",
      });
      console.log("[seed] Default email outreach template created");
    }

    if (!hasSmsDefault) {
      await db.insert(prospectOutreachTemplatesTable).values({
        name: "SMS Introduction",
        channel: "sms",
        subject: null,
        body: "Hi! This is the GalaxyBots team. We found {{companyName}} and think you would benefit from our AI Engine Optimization services. Interested in a quick chat? Reply YES or visit galaxybots.ai to learn more.",
        isDefault: true,
        createdBy: "Sales Bot",
      });
      console.log("[seed] Default SMS outreach template created");
    }
  } catch (err) {
    console.error("[seed] Failed to seed outreach templates:", err);
  }
}
