import bcrypt from "bcryptjs";
import { eq, or, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, clientsTable } from "@workspace/db";

/**
 * Idempotently seeds a single admin user from the ADMIN_EMAIL,
 * ADMIN_USERNAME, and ADMIN_PASSWORD secrets.
 *
 * Behavior:
 *   - If any of the three env vars is missing/empty, logs and exits cleanly.
 *   - If an account already exists (matched by email OR displayName), it is
 *     left untouched. The password is NOT silently rotated — that would
 *     surprise the user and invalidate sessions on every deploy.
 *   - Otherwise, creates a backing "Admin" client and a new owner user.
 *
 * The user can log in with either:
 *   - ADMIN_EMAIL + ADMIN_PASSWORD  (email-based login)
 *   - ADMIN_USERNAME + ADMIN_PASSWORD  (displayName-based login; auth.ts
 *     routes any non-@ identifier through displayName ilike).
 */
export async function seedAdminUser(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !username || !password) {
    console.log(
      "[seed:admin] Skipping — ADMIN_EMAIL, ADMIN_USERNAME, or ADMIN_PASSWORD not set."
    );
    return;
  }

  if (!email.includes("@")) {
    console.error(
      "[seed:admin] ADMIN_EMAIL is not a valid email address; skipping."
    );
    return;
  }

  const existing = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(or(eq(usersTable.email, email), ilike(usersTable.displayName, username)))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `[seed:admin] Admin user already present (id=${existing[0].id}, email=${existing[0].email}); leaving untouched.`
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [client] = await db
    .insert(clientsTable)
    .values({
      companyName: "GalaxyBots Admin",
      contactName: username,
      contactEmail: email,
    })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      clientId: client.id,
      role: "owner",
      displayName: username,
      bypassPayment: true,
      isActive: true,
    })
    .returning();

  console.log(
    `[seed:admin] Created admin user id=${user.id} email=${user.email} username=${username} (client_id=${client.id}).`
  );
}
