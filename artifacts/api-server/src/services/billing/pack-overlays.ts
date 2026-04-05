import { db, installedPacksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ALL_PACKS } from "../../data/packs";

export async function getPackOverlayForBot(
  clientId: number,
  botTitle: string,
): Promise<string> {
  const installedPacks = await db
    .select({ packId: installedPacksTable.packId })
    .from(installedPacksTable)
    .where(eq(installedPacksTable.clientId, clientId));

  if (installedPacks.length === 0) return "";

  const overlays: string[] = [];

  for (const { packId } of installedPacks) {
    const pack = ALL_PACKS.find((p) => p.id === packId);
    if (!pack) continue;

    const overlay = pack.botOverlays.find(
      (o) => o.botTitle.toLowerCase() === botTitle.toLowerCase(),
    );
    if (overlay) {
      overlays.push(`[${pack.name} Industry Context]\n${overlay.overlayPrompt}`);
    }
  }

  if (overlays.length === 0) return "";

  return `\nINDUSTRY EXPERTISE OVERLAY:\n${overlays.join("\n\n")}\n`;
}
