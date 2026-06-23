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

export default router;
