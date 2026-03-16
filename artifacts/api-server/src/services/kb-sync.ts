import {
  db,
  knowledgeBaseSourcesTable,
  kbSourceDocumentsTable,
  kbSourceChunksTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchDocumentsForSource, chunkText, contentHash } from "./kb-connectors";
import { generateEmbedding } from "./memory";
import { decryptCredential } from "../utils/credential-encryption";

const SENSITIVE_CONFIG_KEYS = ["accessToken", "apiToken", "credential", "password"];

function decryptSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted = { ...config };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (decrypted[key] && typeof decrypted[key] === "string") {
      decrypted[key] = decryptCredential(decrypted[key] as string);
    }
  }
  return decrypted;
}

export async function syncSource(sourceId: number): Promise<{ success: boolean; documentCount: number; error?: string }> {
  const [source] = await db
    .select()
    .from(knowledgeBaseSourcesTable)
    .where(eq(knowledgeBaseSourcesTable.id, sourceId));

  if (!source) {
    return { success: false, documentCount: 0, error: "Source not found" };
  }

  await db
    .update(knowledgeBaseSourcesTable)
    .set({ status: "syncing", updatedAt: new Date() })
    .where(eq(knowledgeBaseSourcesTable.id, sourceId));

  try {
    const rawConfig = source.config as Record<string, unknown>;
    const config = decryptSensitiveConfig(rawConfig);
    const fetchedDocs = await fetchDocumentsForSource(source.sourceType, config);
    const fetchedExternalIds = fetchedDocs.map(d => d.externalId);

    const existingDocs = await db
      .select()
      .from(kbSourceDocumentsTable)
      .where(eq(kbSourceDocumentsTable.sourceId, sourceId));

    const existingMap = new Map(existingDocs.map(d => [d.externalId, d]));

    if (fetchedExternalIds.length > 0) {
      const orphanedDocs = existingDocs.filter(d => d.externalId && !fetchedExternalIds.includes(d.externalId));
      for (const orphan of orphanedDocs) {
        await db.delete(kbSourceChunksTable).where(eq(kbSourceChunksTable.documentId, orphan.id));
        await db.delete(kbSourceDocumentsTable).where(eq(kbSourceDocumentsTable.id, orphan.id));
      }
    }

    let processedCount = 0;

    for (const fetched of fetchedDocs) {
      const hash = contentHash(fetched.content);
      const existing = existingMap.get(fetched.externalId);

      if (existing && existing.contentHash === hash) {
        processedCount++;
        continue;
      }

      let docId: number;

      if (existing) {
        await db.delete(kbSourceChunksTable).where(eq(kbSourceChunksTable.documentId, existing.id));
        await db
          .update(kbSourceDocumentsTable)
          .set({
            title: fetched.title,
            content: fetched.content,
            contentHash: hash,
            sourceUrl: fetched.sourceUrl ?? null,
            lastModified: fetched.lastModified ?? null,
            updatedAt: new Date(),
          })
          .where(eq(kbSourceDocumentsTable.id, existing.id));
        docId = existing.id;
      } else {
        const [newDoc] = await db
          .insert(kbSourceDocumentsTable)
          .values({
            sourceId,
            clientId: source.clientId,
            externalId: fetched.externalId,
            title: fetched.title,
            content: fetched.content,
            contentHash: hash,
            sourceUrl: fetched.sourceUrl ?? null,
            lastModified: fetched.lastModified ?? null,
          })
          .returning();
        docId = newDoc.id;
      }

      const chunks = chunkText(fetched.content);
      for (let i = 0; i < chunks.length; i++) {
        let embedding = null;
        try {
          embedding = await generateEmbedding(chunks[i]);
        } catch (err) {
          console.error(`Failed to generate embedding for chunk ${i} of doc ${docId}:`, err);
        }

        await db.insert(kbSourceChunksTable).values({
          documentId: docId,
          sourceId,
          clientId: source.clientId,
          content: chunks[i],
          chunkIndex: i,
          embedding: embedding ? JSON.stringify(embedding) : null,
        });
      }

      processedCount++;
    }

    await db
      .update(knowledgeBaseSourcesTable)
      .set({
        status: "active",
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
        documentCount: processedCount,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseSourcesTable.id, sourceId));

    return { success: true, documentCount: processedCount };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Sync error for source ${sourceId}:`, err);

    await db
      .update(knowledgeBaseSourcesTable)
      .set({
        status: "error",
        lastSyncStatus: "error",
        lastSyncError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseSourcesTable.id, sourceId));

    return { success: false, documentCount: 0, error: errorMessage };
  }
}
