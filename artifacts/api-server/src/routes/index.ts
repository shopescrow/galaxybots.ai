import { Router, type IRouter } from "express";

import { registerAuthRoutes } from "./auth";
import { registerBotRoutes } from "./bots";
import { registerClientRoutes } from "./clients";
import { registerMissionRoutes } from "./missions";
import { registerContentRoutes } from "./content";
import { registerAnalyticsRoutes } from "./analytics";
import { registerBillingRoutes } from "./billing";
import { registerComplianceRoutes } from "./compliance";
import { registerPartnerRoutes } from "./partner";
import { registerProspectingRoutes } from "./prospecting";
import { registerAdminRoutes } from "./admin";
import { registerPlatformRoutes } from "./platform";
import { registerLiberatorRoutes } from "./liberator";
import { registerGuardianRoutes } from "./guardian";
import { registerCoordinatorRoutes } from "./coordinator";
import { registerSelfImprovementRoutes } from "./self-improvement";
import { registerIntelligenceRoutes } from "./intelligence";
import { registerGaaRoutes } from "./gaa";
import { registerMoltbookRoutes } from "./moltbook";
import { registerAssetRoutes } from "./assets";

const router: IRouter = Router();

registerPlatformRoutes(router);
registerAuthRoutes(router);
registerBotRoutes(router);
registerClientRoutes(router);
registerMissionRoutes(router);
registerContentRoutes(router);
registerAnalyticsRoutes(router);
registerBillingRoutes(router);
registerComplianceRoutes(router);
registerPartnerRoutes(router);
registerProspectingRoutes(router);
registerAdminRoutes(router);
registerLiberatorRoutes(router);
registerGuardianRoutes(router);
registerCoordinatorRoutes(router);
registerSelfImprovementRoutes(router);
registerIntelligenceRoutes(router);
registerGaaRoutes(router);
registerMoltbookRoutes(router);
registerAssetRoutes(router);

export default router;
