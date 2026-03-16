import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  db,
  ssoConfigsTable,
  usersTable,
  platformAuditLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptCredential } from "../utils/credential-encryption";

const router: IRouter = Router();

interface ScimAuthContext {
  clientId: number;
}

declare global {
  namespace Express {
    interface Request {
      scimAuth?: ScimAuthContext;
    }
  }
}

async function scimAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "401",
      detail: "Bearer token required",
    });
    return;
  }

  const token = authHeader.slice(7);
  const configs = await db
    .select()
    .from(ssoConfigsTable);

  const config = configs.find((c) => {
    if (!c.scimToken) return false;
    try {
      return decryptCredential(c.scimToken) === token;
    } catch {
      return c.scimToken === token;
    }
  });

  if (!config) {
    res.status(401).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "401",
      detail: "Invalid SCIM token",
    });
    return;
  }

  req.scimAuth = { clientId: config.clientId };
  next();
}

function toScimUser(user: {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
}) {
  const nameParts = (user.displayName || user.email.split("@")[0]).split(" ");
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: String(user.id),
    userName: user.email,
    name: {
      givenName: nameParts[0] || "",
      familyName: nameParts.slice(1).join(" ") || "",
    },
    emails: [{ value: user.email, primary: true }],
    displayName: user.displayName || user.email.split("@")[0],
    active: user.isActive,
    roles: [{ value: user.role }],
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
    },
  };
}

router.get("/scim/v2/Users", scimAuth, async (req, res): Promise<void> => {
  const clientId = req.scimAuth!.clientId;
  const startIndex = Number(req.query.startIndex) || 1;
  const count = Math.min(Number(req.query.count) || 100, 200);

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clientId, clientId));

  const paged = users.slice(startIndex - 1, startIndex - 1 + count);

  res.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: users.length,
    startIndex,
    itemsPerPage: paged.length,
    Resources: paged.map(toScimUser),
  });
});

router.get("/scim/v2/Users/:id", scimAuth, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "Invalid user ID",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, userId),
        eq(usersTable.clientId, req.scimAuth!.clientId),
      ),
    );

  if (!user) {
    res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "404",
      detail: "User not found",
    });
    return;
  }

  res.json(toScimUser(user));
});

router.post("/scim/v2/Users", scimAuth, async (req, res): Promise<void> => {
  const clientId = req.scimAuth!.clientId;
  const { userName, name, displayName, active } = req.body;

  if (!userName) {
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "userName is required",
    });
    return;
  }

  const email = userName.toLowerCase();

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "409",
      detail: "User already exists",
    });
    return;
  }

  const [config] = await db
    .select()
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.clientId, clientId));

  const fullName = displayName ||
    (name ? `${name.givenName || ""} ${name.familyName || ""}`.trim() : email.split("@")[0]);

  const placeholderHash = "$2a$12$SSO_PLACEHOLDER_HASH_SCIM_PROVISIONED";

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: placeholderHash,
      clientId,
      role: config?.jitDefaultRole || "viewer",
      displayName: fullName,
      ssoProvider: "scim",
      isActive: active !== false,
    })
    .returning();

  await db.insert(platformAuditLogTable).values({
    clientId,
    userId: user.id,
    action: "scim_user_created",
    resource: "user",
    resourceId: String(user.id),
    metadata: { email },
  });

  res.status(201).json(toScimUser(user));
});

router.patch("/scim/v2/Users/:id", scimAuth, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  const clientId = req.scimAuth!.clientId;

  if (isNaN(userId)) {
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "Invalid user ID",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, userId),
        eq(usersTable.clientId, clientId),
      ),
    );

  if (!user) {
    res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "404",
      detail: "User not found",
    });
    return;
  }

  const DEFAULT_GROUP_ROLE_MAP: Record<string, string> = {
    admin: "admin",
    admins: "admin",
    administrators: "admin",
    owner: "owner",
    owners: "owner",
    viewer: "viewer",
    viewers: "viewer",
    member: "viewer",
    members: "viewer",
  };

  const [ssoConfig] = await db
    .select()
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.clientId, clientId));

  const groupRoleMap: Record<string, string> = {
    ...DEFAULT_GROUP_ROLE_MAP,
    ...(ssoConfig?.scimGroupRoleMapping as Record<string, string> || {}),
  };

  const updates: Record<string, unknown> = {};
  const { Operations } = req.body;

  if (Array.isArray(Operations)) {
    for (const op of Operations) {
      if (op.op === "replace" || op.op === "Replace") {
        if (op.path === "active" || (op.value && typeof op.value.active !== "undefined")) {
          updates.isActive = op.path === "active" ? op.value : op.value.active;
        }
        if (op.path === "displayName" || (op.value && op.value.displayName)) {
          updates.displayName = op.path === "displayName" ? op.value : op.value.displayName;
        }
        if (op.path === "userName" || (op.value && op.value.userName)) {
          const newEmail = (op.path === "userName" ? op.value : op.value.userName) as string;
          updates.email = newEmail.toLowerCase();
        }
        if (op.path === "roles" && Array.isArray(op.value)) {
          const primaryRole = op.value.find((r: { primary?: boolean; value?: string }) => r.primary)?.value || op.value[0]?.value;
          if (primaryRole) {
            const mapped = groupRoleMap[primaryRole.toLowerCase()];
            if (mapped) updates.role = mapped;
          }
        }
      }
      if (op.op === "add" || op.op === "Add") {
        if (op.path === "members" || op.path === "groups") {
          if (Array.isArray(op.value)) {
            for (const group of op.value) {
              const groupName = (group.display || group.value || "").toLowerCase();
              const mapped = groupRoleMap[groupName];
              if (mapped) updates.role = mapped;
            }
          }
        }
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId));
  }

  const [updatedUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  await db.insert(platformAuditLogTable).values({
    clientId,
    userId,
    action: "scim_user_updated",
    resource: "user",
    resourceId: String(userId),
    metadata: { updates },
  });

  res.json(toScimUser(updatedUser));
});

router.delete("/scim/v2/Users/:id", scimAuth, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  const clientId = req.scimAuth!.clientId;

  if (isNaN(userId)) {
    res.status(400).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "400",
      detail: "Invalid user ID",
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, userId),
        eq(usersTable.clientId, clientId),
      ),
    );

  if (!user) {
    res.status(404).json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "404",
      detail: "User not found",
    });
    return;
  }

  await db
    .update(usersTable)
    .set({ isActive: false })
    .where(eq(usersTable.id, userId));

  await db.insert(platformAuditLogTable).values({
    clientId,
    userId,
    action: "scim_user_deactivated",
    resource: "user",
    resourceId: String(userId),
    metadata: { email: user.email },
  });

  res.status(204).send();
});

export default router;
