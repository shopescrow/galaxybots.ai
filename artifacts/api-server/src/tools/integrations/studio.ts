import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { db, documentsTable } from "@workspace/db";
import { logToolActivity } from "./_shared";

registerTool({
  name: "create_studio_document",
  description: "Create a document in the Document Studio. This saves the document in-platform where the user can view, edit, and export it.",
  inputSchema: z.object({
    title: z.string().describe("Document title"),
    content: z.string().describe("Document content (plain text or markdown)"),
    department: z.string().optional().describe("Department the document belongs to"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) {
      return { success: false, error: "No client context available" };
    }

    const tiptapContent = {
      type: "doc",
      content: input.content.split("\n").map((line: string) => {
        if (line.startsWith("# ")) {
          return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: line.slice(2) }] };
        }
        if (line.startsWith("## ")) {
          return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: line.slice(3) }] };
        }
        if (line.startsWith("### ")) {
          return { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: line.slice(4) }] };
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: line.slice(2) }] }] }],
          };
        }
        return { type: "paragraph", content: line ? [{ type: "text", text: line }] : [] };
      }),
    };

    try {
      const [doc] = await db.insert(documentsTable).values({
        clientId: context.clientId,
        title: input.title,
        content: tiptapContent,
        botId: context.botId ?? null,
        sessionId: context.sessionId ? parseInt(String(context.sessionId)) : null,
        department: input.department ?? null,
        status: "draft",
        versionHistory: [],
        currentVersion: 1,
      }).returning();

      await logToolActivity("create_studio_document", context, {
        metadata: { documentId: doc.id, title: input.title },
      });

      return { success: true, documentId: doc.id, title: input.title, message: `Document "${input.title}" created in Document Studio` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create document" };
    }
  },
});
