import { db, bingolingoClientsTable, bingolingoContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { broadcastSSE } from "../sse";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let lastBingolingoCheck = 0;
const BINGOLINGO_WEEKLY_INTERVAL = 7 * 24 * 60 * 60 * 1000;

export async function checkBingolingoAutoContent() {
  const now = Date.now();
  if (now - lastBingolingoCheck < BINGOLINGO_WEEKLY_INTERVAL) return;
  lastBingolingoCheck = now;

  try {
    const clients = await db
      .select()
      .from(bingolingoClientsTable)
      .where(eq(bingolingoClientsTable.autoContentEnabled, true));

    for (const client of clients) {
      try {
        const topicCompletion = await openai.chat.completions.create({
          model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
          max_completion_tokens: 200,
          messages: [
            {
              role: "system",
              content: `Suggest a single compelling blog post topic for a company in the ${client.industry} industry called "${client.name}". Return only the topic title, nothing else.`,
            },
            { role: "user", content: "Suggest a timely, relevant blog topic." },
          ],
        });
        const topic = topicCompletion.choices[0]?.message?.content?.trim() || `${client.industry} insights for ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

        const systemPrompt = `You are an expert SEO content writer. Generate a well-structured blog post with an engaging H1 title, clear H2/H3 subheadings, SEO-optimized content, and a strong conclusion. Return in markdown format.`;
        const completion = await openai.chat.completions.create({
          model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
          max_completion_tokens: 3000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Industry: ${client.industry}\nCompany: ${client.name}\nTopic: ${topic}\nTone: ${client.defaultTone}\n\nGenerate the content now.` },
          ],
        });

        const body = completion.choices[0]?.message?.content ?? "";
        const titleMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.+)\n/);
        const title = titleMatch ? titleMatch[1].replace(/^#+\s*/, "").trim() : topic;
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

        await db.insert(bingolingoContentTable).values({
          clientId: client.id,
          type: "blog",
          title,
          slug,
          body,
          metaDescription: body.slice(0, 155).trim() + "...",
          status: "draft",
          topic,
          tone: client.defaultTone,
          keywords: null,
        });

        broadcastSSE("bingolingo-auto-content", {
          clientId: client.galaxybotsClientId,
          bingolingoClientId: client.id,
          clientName: client.name,
          title,
          message: `BingoLingo auto-generated a draft blog post: "${title}"`,
        });
      } catch (err: unknown) {
        console.error(`[scheduler] BingoLingo auto-content for client ${client.id}: ${errMsg(err)}`);
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] BingoLingo auto-content check failed: ${errMsg(err)}`);
  }
}
