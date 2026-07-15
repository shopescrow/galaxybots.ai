import { Router, type IRouter } from "express";
import { z } from "zod";
import multer from "multer";
import { db, staffProfilesTable, AVATAR_PLACEHOLDER_VALUES } from "@workspace/db";
import { eq, and, or, ilike } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { ObjectStorageService } from "../../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WebP, GIF"));
    }
  },
});

const ADMIN_ROLES = ["owner", "admin", "csuite"];

function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

function stripAdminFields(profile: typeof staffProfilesTable.$inferSelect) {
  const { adminNote, employeeId, ...safe } = profile;
  return safe;
}

const CreateStaffBody = z.object({
  name: z.string().min(1, "Name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  employeeId: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  avatarPlaceholder: z.enum(AVATAR_PLACEHOLDER_VALUES).nullable().optional(),
  selfNote: z.string().nullable().optional(),
  adminNote: z.string().nullable().optional(),
});

const UpdateStaffBody = z.object({
  name: z.string().min(1).optional(),
  jobTitle: z.string().min(1).optional(),
  employeeId: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  avatarPlaceholder: z.enum(AVATAR_PLACEHOLDER_VALUES).nullable().optional(),
  selfNote: z.string().nullable().optional(),
  adminNote: z.string().nullable().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: "At least one field must be provided",
});

router.get("/clients/:clientId/staff", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const search = req.query.search as string | undefined;

  let profiles: (typeof staffProfilesTable.$inferSelect)[];

  if (search) {
    profiles = await db
      .select()
      .from(staffProfilesTable)
      .where(
        and(
          eq(staffProfilesTable.clientId, clientId),
          or(
            ilike(staffProfilesTable.name, `%${search}%`),
            ilike(staffProfilesTable.jobTitle, `%${search}%`),
          ),
        ),
      )
      .orderBy(staffProfilesTable.name);
  } else {
    profiles = await db
      .select()
      .from(staffProfilesTable)
      .where(eq(staffProfilesTable.clientId, clientId))
      .orderBy(staffProfilesTable.name);
  }

  const callerIsAdmin = isAdminRole(req.user!.role);
  const result = callerIsAdmin ? profiles : profiles.map(stripAdminFields);
  res.json(result);
});

router.post("/clients/:clientId/staff", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { name, jobTitle, employeeId, avatarUrl, avatarPlaceholder, selfNote, adminNote } = parsed.data;

  const [profile] = await db
    .insert(staffProfilesTable)
    .values({
      clientId,
      name,
      jobTitle,
      employeeId: employeeId ?? null,
      avatarUrl: avatarUrl ?? null,
      avatarPlaceholder: avatarPlaceholder ?? null,
      selfNote: selfNote ?? null,
      adminNote: adminNote ?? null,
      createdBy: req.user!.userId,
    })
    .returning();

  res.status(201).json(profile);
});

router.get("/clients/:clientId/staff/:staffId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const staffId = Number(req.params.staffId);
  if (isNaN(clientId) || isNaN(staffId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [profile] = await db
    .select()
    .from(staffProfilesTable)
    .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)));

  if (!profile) {
    res.status(404).json({ error: "Staff profile not found" });
    return;
  }

  const callerIsAdmin = isAdminRole(req.user!.role);
  res.json(callerIsAdmin ? profile : stripAdminFields(profile));
});

router.patch("/clients/:clientId/staff/:staffId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const staffId = Number(req.params.staffId);
  if (isNaN(clientId) || isNaN(staffId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const [existing] = await db
    .select({ id: staffProfilesTable.id })
    .from(staffProfilesTable)
    .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)));

  if (!existing) {
    res.status(404).json({ error: "Staff profile not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  const data = parsed.data;
  if (data.name !== undefined) updates.name = data.name;
  if (data.jobTitle !== undefined) updates.jobTitle = data.jobTitle;
  if (data.employeeId !== undefined) updates.employeeId = data.employeeId;
  if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
  if (data.avatarPlaceholder !== undefined) updates.avatarPlaceholder = data.avatarPlaceholder;
  if (data.selfNote !== undefined) updates.selfNote = data.selfNote;
  if (data.adminNote !== undefined) updates.adminNote = data.adminNote;

  const [updated] = await db
    .update(staffProfilesTable)
    .set(updates)
    .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)))
    .returning();

  res.json(updated);
});

router.delete("/clients/:clientId/staff/:staffId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const staffId = Number(req.params.staffId);
  if (isNaN(clientId) || isNaN(staffId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [deleted] = await db
    .delete(staffProfilesTable)
    .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)))
    .returning({ id: staffProfilesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Staff profile not found" });
    return;
  }

  res.status(204).end();
});

router.post(
  "/clients/:clientId/staff/:staffId/avatar",
  requireRole("owner", "admin"),
  upload.single("avatar"),
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    const staffId = Number(req.params.staffId);
    if (isNaN(clientId) || isNaN(staffId) || clientId !== req.user!.clientId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [existing] = await db
      .select({ id: staffProfilesTable.id })
      .from(staffProfilesTable)
      .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)));

    if (!existing) {
      res.status(404).json({ error: "Staff profile not found" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const ownerPrefix = `client-${clientId}/staff`;
    const objectPath = await objectStorage.uploadBytes({
      data: req.file.buffer,
      contentType: req.file.mimetype,
      ownerPrefix,
    });

    const [updated] = await db
      .update(staffProfilesTable)
      .set({ avatarUrl: objectPath, avatarPlaceholder: null })
      .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)))
      .returning();

    res.json({ avatarUrl: updated.avatarUrl });
  },
);

router.get("/clients/:clientId/staff/:staffId/avatar", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const staffId = Number(req.params.staffId);
  if (isNaN(clientId) || isNaN(staffId) || clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [profile] = await db
    .select({ avatarUrl: staffProfilesTable.avatarUrl })
    .from(staffProfilesTable)
    .where(and(eq(staffProfilesTable.id, staffId), eq(staffProfilesTable.clientId, clientId)));

  if (!profile?.avatarUrl) {
    res.status(404).json({ error: "No avatar found" });
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(profile.avatarUrl);
    const response = await objectStorage.downloadObject(objectFile, 3600);
    const headers = Object.fromEntries(response.headers.entries());
    res.set(headers);
    const reader = response.body!.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
      await pump();
    };
    await pump();
  } catch {
    res.status(404).json({ error: "Avatar not found" });
  }
});

export default router;
