import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function buildClientContext(clientId: number): Promise<string> {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  if (!client) return "";

  const hasContext = client.businessContext || client.industry || client.websiteUrl || client.targetMarket || (client.servicesList && client.servicesList.length > 0);
  if (!hasContext) return "";

  const parts: string[] = [
    `\nCLIENT CONTEXT:`,
    `You are working for ${client.companyName}.`,
  ];
  if (client.industry) parts.push(`Industry: ${client.industry}`);
  if (client.websiteUrl) parts.push(`Website: ${client.websiteUrl}`);
  if (client.servicesList && client.servicesList.length > 0)
    parts.push(`Services: ${client.servicesList.join(", ")}`);
  if (client.targetMarket) parts.push(`Target Market: ${client.targetMarket}`);
  if (client.businessContext) parts.push(`Business Brief: ${client.businessContext}`);

  return parts.join("\n");
}
