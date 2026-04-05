import { db, clientIntegrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isV2Encrypted, reencryptToV2 } from "../utils/credential-encryption";

async function migrateCredentialsToV2() {
  console.log("[migrate-credentials-v2] Starting credential migration...");

  const allIntegrations = await db.select().from(clientIntegrationsTable);
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const integration of allIntegrations) {
    if (isV2Encrypted(integration.credential)) {
      skipped++;
      continue;
    }

    if (!integration.credential.startsWith("enc:")) {
      skipped++;
      continue;
    }

    try {
      const v2Encrypted = reencryptToV2(integration.credential);
      if (!v2Encrypted) {
        skipped++;
        continue;
      }

      await db
        .update(clientIntegrationsTable)
        .set({ credential: v2Encrypted })
        .where(eq(clientIntegrationsTable.id, integration.id));

      migrated++;
      console.log(`[migrate-credentials-v2] Migrated integration id=${integration.id} service=${integration.service}`);
    } catch (err) {
      failed++;
      console.error(`[migrate-credentials-v2] Failed to migrate integration id=${integration.id}:`, err);
    }
  }

  console.log(`[migrate-credentials-v2] Migration complete: migrated=${migrated}, skipped=${skipped}, failed=${failed}`);
}

migrateCredentialsToV2()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate-credentials-v2] Fatal error:", err);
    process.exit(1);
  });
