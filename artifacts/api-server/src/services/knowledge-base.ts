import {
  db,
  knowledgeBaseDocumentsTable,
  knowledgeBaseChunksTable,
} from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { generateEmbedding } from "./memory";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;

export function splitTextIntoChunks(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= CHUNK_SIZE) {
    return [cleaned];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + CHUNK_SIZE;

    if (end < cleaned.length) {
      const segment = cleaned.substring(start, end);
      const lastParagraph = segment.lastIndexOf("\n\n");
      const lastSentence = segment.lastIndexOf(". ");
      const lastNewline = segment.lastIndexOf("\n");

      if (lastParagraph > CHUNK_SIZE * 0.3) {
        end = start + lastParagraph + 2;
      } else if (lastSentence > CHUNK_SIZE * 0.3) {
        end = start + lastSentence + 2;
      } else if (lastNewline > CHUNK_SIZE * 0.3) {
        end = start + lastNewline + 1;
      }
    }

    const chunk = cleaned.substring(start, Math.min(end, cleaned.length)).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - CHUNK_OVERLAP;
    if (start >= cleaned.length) break;
  }

  return chunks;
}

export async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() || "";

  if (ext === "txt" || ext === "md" || mimeType === "text/plain" || mimeType === "text/markdown") {
    return buffer.toString("utf-8");
  }

  if (ext === "pdf" || mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text || "";
  }

  if (
    ext === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext} (${mimeType})`);
}

export async function ingestDocument(params: {
  clientId: number;
  title: string;
  sourceFilename: string;
  fileType: string;
  text: string;
}) {
  const chunks = splitTextIntoChunks(params.text);

  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    embeddings.push(await generateEmbedding(chunk));
  }

  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(knowledgeBaseDocumentsTable)
      .values({
        clientId: params.clientId,
        title: params.title,
        sourceFilename: params.sourceFilename,
        fileType: params.fileType,
        chunkCount: chunks.length,
      })
      .returning();

    for (let i = 0; i < chunks.length; i++) {
      await tx.insert(knowledgeBaseChunksTable).values({
        documentId: doc.id,
        clientId: params.clientId,
        chunkText: chunks[i],
        chunkIndex: i,
        embedding: embeddings[i],
      });
    }

    return doc;
  });
}

export async function retrieveKnowledgeBaseChunks(params: {
  clientId: number;
  query: string;
  limit?: number;
}) {
  const queryEmbedding = await generateEmbedding(params.query);
  const limit = params.limit ?? 5;

  const chunks = await db
    .select({
      id: knowledgeBaseChunksTable.id,
      documentId: knowledgeBaseChunksTable.documentId,
      chunkText: knowledgeBaseChunksTable.chunkText,
      chunkIndex: knowledgeBaseChunksTable.chunkIndex,
      documentTitle: knowledgeBaseDocumentsTable.title,
      similarity: sql<number>`1 - (${knowledgeBaseChunksTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`.as("similarity"),
    })
    .from(knowledgeBaseChunksTable)
    .innerJoin(
      knowledgeBaseDocumentsTable,
      eq(knowledgeBaseChunksTable.documentId, knowledgeBaseDocumentsTable.id),
    )
    .where(eq(knowledgeBaseChunksTable.clientId, params.clientId))
    .orderBy(sql`${knowledgeBaseChunksTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
    .limit(limit);

  return chunks;
}

export async function buildKnowledgeBaseContext(
  clientId: number,
  query: string,
): Promise<string> {
  const chunks = await retrieveKnowledgeBaseChunks({ clientId, query, limit: 5 });
  if (chunks.length === 0) return "";

  const kbBlock = chunks
    .map(
      (c, i) =>
        `[KB ${i + 1} — from "${c.documentTitle}"] ${c.chunkText}`,
    )
    .join("\n\n");

  return `\n\n--- COMPANY KNOWLEDGE BASE ---\nThe following excerpts are from your company's uploaded knowledge base documents. You may cite "from your knowledge base" when using this information.\n${kbBlock}\n--- END KNOWLEDGE BASE ---`;
}

export async function listDocuments(clientId: number) {
  return db
    .select()
    .from(knowledgeBaseDocumentsTable)
    .where(eq(knowledgeBaseDocumentsTable.clientId, clientId))
    .orderBy(knowledgeBaseDocumentsTable.uploadedAt);
}

export async function deleteDocument(documentId: number, clientId: number) {
  return db
    .delete(knowledgeBaseDocumentsTable)
    .where(
      and(
        eq(knowledgeBaseDocumentsTable.id, documentId),
        eq(knowledgeBaseDocumentsTable.clientId, clientId),
      ),
    );
}
