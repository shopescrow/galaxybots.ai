import type { Request, Response, NextFunction } from "express";

export async function validateTenantOwnership(
  callerClientId: number,
  targetId: number,
  isPlatformAdmin: boolean
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  if (callerClientId === targetId) return true;
  return false;
}


export function requireTenantAccess(paramName: "subClientId" | "clientId" = "subClientId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const callerClientId = req.user?.clientId;
    if (!callerClientId) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    let targetId: number | null = null;

    if (paramName === "subClientId") {
      const raw = req.body?.subClientId ?? req.query?.subClientId;
      if (raw !== undefined && raw !== null && raw !== "") {
        targetId = Number(raw);
      }
    } else {
      const raw = req.body?.clientId ?? req.query?.clientId ?? req.params?.clientId;
      if (raw !== undefined && raw !== null && raw !== "") {
        targetId = Number(raw);
      }
    }

    if (targetId === null || isNaN(targetId)) {
      next();
      return;
    }

    const isPlatformAdmin = req.user?.bypassPayment === true;
    const allowed = await validateTenantOwnership(callerClientId, targetId, isPlatformAdmin);
    if (!allowed) {
      res.status(403).json({
        error: "TENANT_ACCESS_DENIED",
        message: `You do not have access to the requested ${paramName === "subClientId" ? "sub-client" : "client"}`,
      });
      return;
    }

    next();
  };
}
