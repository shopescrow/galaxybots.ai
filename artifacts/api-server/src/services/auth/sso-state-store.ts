import { db, ssoStateTable } from "@workspace/db";
import { eq, lt, and, gt } from "drizzle-orm";

interface SsoStateEntry {
  clientId: number;
  codeVerifier?: string;
  nonce?: string;
  createdAt: number;
}

interface SsoCompletionEntry {
  token: string;
  maxAge: number;
  createdAt: number;
}

const DEPLOYMENT_TIME = Date.now();
const GRACE_PERIOD_MS = 10 * 60 * 1000;

const legacySsoStateStore = new Map<string, SsoStateEntry>();
const legacySsoCompletionCodes = new Map<string, SsoCompletionEntry>();

let gracePeriodActive = true;

function isInGracePeriod(): boolean {
  if (!gracePeriodActive) return false;
  if (Date.now() - DEPLOYMENT_TIME >= GRACE_PERIOD_MS) {
    gracePeriodActive = false;
    legacySsoStateStore.clear();
    legacySsoCompletionCodes.clear();
  }
  return gracePeriodActive;
}

export async function setSsoState(key: string, data: SsoStateEntry): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(ssoStateTable).values({
    stateKey: key,
    stateData: data,
    stateType: "sso_state",
    expiresAt,
  });
  if (isInGracePeriod()) {
    legacySsoStateStore.set(key, data);
  }
}

export async function consumeSsoState(key: string): Promise<SsoStateEntry | null> {
  const deleted = await db
    .delete(ssoStateTable)
    .where(
      and(
        eq(ssoStateTable.stateKey, key),
        gt(ssoStateTable.expiresAt, new Date()),
      ),
    )
    .returning();

  if (deleted.length > 0) {
    if (isInGracePeriod()) {
      legacySsoStateStore.delete(key);
    }
    return deleted[0].stateData as SsoStateEntry;
  }

  if (isInGracePeriod()) {
    const legacy = legacySsoStateStore.get(key);
    if (legacy && Date.now() - legacy.createdAt < 10 * 60 * 1000) {
      legacySsoStateStore.delete(key);
      return legacy;
    }
  }

  return null;
}

export async function setSsoCompletionCode(code: string, data: SsoCompletionEntry): Promise<void> {
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
  await db.insert(ssoStateTable).values({
    stateKey: `completion:${code}`,
    stateData: data,
    stateType: "completion_code",
    expiresAt,
  });
  if (isInGracePeriod()) {
    legacySsoCompletionCodes.set(code, data);
  }
}

export async function consumeSsoCompletionCode(code: string): Promise<SsoCompletionEntry | null> {
  const key = `completion:${code}`;
  const deleted = await db
    .delete(ssoStateTable)
    .where(
      and(
        eq(ssoStateTable.stateKey, key),
        gt(ssoStateTable.expiresAt, new Date()),
      ),
    )
    .returning();

  if (deleted.length > 0) {
    if (isInGracePeriod()) {
      legacySsoCompletionCodes.delete(code);
    }
    return deleted[0].stateData as SsoCompletionEntry;
  }

  if (isInGracePeriod()) {
    const legacy = legacySsoCompletionCodes.get(code);
    if (legacy && Date.now() - legacy.createdAt < 2 * 60 * 1000) {
      legacySsoCompletionCodes.delete(code);
      return legacy;
    }
  }

  return null;
}

export async function cleanupExpiredState(): Promise<void> {
  await db.delete(ssoStateTable).where(lt(ssoStateTable.expiresAt, new Date()));
}

setInterval(() => {
  cleanupExpiredState().catch(err =>
    console.error("[SSO State] Cleanup failed:", err)
  );
}, 60 * 1000);
