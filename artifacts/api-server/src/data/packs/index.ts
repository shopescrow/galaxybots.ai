import type { VerticalPack } from "./types";
import { saasTechPack } from "./saas-tech";
import { legalPack } from "./legal";
import { restaurantPack } from "./restaurant";
import { realEstatePack } from "./real-estate";
import { healthcarePack } from "./healthcare";
import { agencyPack } from "./agency";

export type { VerticalPack, PackBotOverlay, PackScenario, PackPipeline, PackPipelineStep, PackKBDocument } from "./types";

export const ALL_PACKS: VerticalPack[] = [
  saasTechPack,
  legalPack,
  restaurantPack,
  realEstatePack,
  healthcarePack,
  agencyPack,
];

export function getPackById(packId: string): VerticalPack | undefined {
  return ALL_PACKS.find((p) => p.id === packId);
}

export function getPacksByIndustry(industry: string): VerticalPack[] {
  return ALL_PACKS.filter(
    (p) => p.industry.toLowerCase() === industry.toLowerCase(),
  );
}
