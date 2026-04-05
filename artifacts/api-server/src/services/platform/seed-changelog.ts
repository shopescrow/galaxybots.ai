import { db, apiChangelogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function seedApiVersioningChangelog(): Promise<void> {
  const version = "1.0.0";
  const [existing] = await db
    .select()
    .from(apiChangelogTable)
    .where(eq(apiChangelogTable.version, version))
    .limit(1);

  if (existing) return;

  await db.insert(apiChangelogTable).values({
    version,
    title: "API Versioning — All endpoints now available under /api/v1/",
    description:
      "All Developer API endpoints are now served under the /api/v1/ prefix. " +
      "The unversioned /api/ paths continue to work during a 6-month deprecation period " +
      "and will return Deprecation: true and Sunset: 2026-10-05 headers. " +
      "Update your integrations to use /api/v1/ before the sunset date. " +
      "GoDaddy Payments is now supported as an alternative billing provider, and " +
      "GDPR Subject Access Request (SAR) data export is available at GET /api/v1/data-export/:clientId.",
    breaking: true,
    changes: [
      "All API endpoints now available under /api/v1/ prefix",
      "Legacy /api/ paths return Deprecation and Sunset headers (sunset: 2026-10-05)",
      "MCP server updated to use /api/v1/ base path",
      "GoDaddy Payments integration added as alternative billing provider (BILLING_PROVIDER=godaddy)",
      "POST /api/v1/billing/godaddy/webhook endpoint for GoDaddy payment confirmations",
      "Billing page now dynamically shows active payment provider",
      "GET /api/v1/data-export/:clientId — GDPR Subject Access Request data export (async)",
      "GET /api/v1/data-export/:clientId/status/:jobId — Check export job status",
      "OpenAPI spec updated with /api/v1 as primary server URL",
    ],
    publishedAt: new Date(),
  });

  console.log("[seed] API versioning changelog entry created (v1.0.0)");
}
