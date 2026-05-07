import { db, pushTokensTable, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
}

type NotificationCategory = "prospect" | "aeo" | "competitor" | "cost" | "bot" | "pipeline" | "system" | "approval";

const CATEGORY_PREF_MAP: Record<string, string> = {
  bot: "notifyBotActions",
  cost: "notifyCostAlerts",
  system: "notifySystem",
};

async function isUserPushAllowed(
  userId: number,
  category?: NotificationCategory,
  opts?: { isApproval?: boolean; isScheduled?: boolean },
): Promise<boolean> {
  const prefs = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);

  if (prefs.length === 0) return true;

  const pref = prefs[0] as Record<string, unknown>;
  if (!pref.pushEnabled) return false;

  if (opts?.isApproval) {
    if (pref.notifyApprovals === false) return false;
    return true;
  }

  if (opts?.isScheduled) {
    if (pref.notifyScheduler === false) return false;
    return true;
  }

  if (category) {
    const prefKey = CATEGORY_PREF_MAP[category];
    if (prefKey && pref[prefKey] === false) return false;
  }

  return true;
}

export async function sendPushToUser(
  userId: number,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
    badge?: number;
    category?: NotificationCategory;
    isApproval?: boolean;
    isScheduled?: boolean;
  },
): Promise<void> {
  const allowed = await isUserPushAllowed(userId, payload.category, {
    isApproval: payload.isApproval,
    isScheduled: payload.isScheduled,
  });
  if (!allowed) return;

  const tokens = await db
    .select()
    .from(pushTokensTable)
    .where(eq(pushTokensTable.userId, userId));

  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: "default",
    badge: payload.badge,
    priority: "high",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[push-sender] Expo push API error:", res.status, text);
    }
  } catch (err) {
    console.error("[push-sender] Failed to send push notification:", err);
  }
}

export async function sendPushToClient(
  clientId: number,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
    badge?: number;
    category?: NotificationCategory;
    isApproval?: boolean;
    isScheduled?: boolean;
  },
): Promise<void> {
  const { usersTable } = await import("@workspace/db");
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clientId, clientId));

  await Promise.all(users.map((u) => sendPushToUser(u.id, payload)));
}
