import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const STATIC_SALT = "galaxybots-salt";

let encryptionKeyWarningLogged = false;

function getEncryptionSecret(): string {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be set in production. " +
      "Generate a 32+ character random string and set it as an environment variable."
    );
  }

  const fallback = process.env.DATABASE_URL;
  if (!fallback) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY or DATABASE_URL must be set for credential encryption.");
  }

  if (!encryptionKeyWarningLogged) {
    console.warn(
      "[credential-encryption] WARNING: CREDENTIAL_ENCRYPTION_KEY is not set. " +
      "Falling back to DATABASE_URL. This is insecure and not allowed in production."
    );
    encryptionKeyWarningLogged = true;
  }

  return fallback;
}

function deriveKeyV1(): Buffer {
  return scryptSync(getEncryptionSecret(), STATIC_SALT, KEY_LENGTH);
}

function deriveKeyV2(salt: Buffer): Buffer {
  return scryptSync(getEncryptionSecret(), salt, KEY_LENGTH);
}

export function encryptCredential(plaintext: string): string {
  const salt = randomBytes(16);
  const key = deriveKeyV2(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `enc_v2:${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptCredential(stored: string): string {
  if (stored.startsWith("enc_v2:")) {
    const parts = stored.split(":");
    if (parts.length !== 5) return stored;
    const [, saltHex, ivHex, authTagHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const key = deriveKeyV2(salt);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  if (stored.startsWith("enc:")) {
    const parts = stored.split(":");
    if (parts.length !== 4) return stored;
    const [, ivHex, authTagHex, encrypted] = parts;
    const key = deriveKeyV1();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  return stored;
}

export function isV2Encrypted(stored: string): boolean {
  return stored.startsWith("enc_v2:");
}

export function reencryptToV2(stored: string): string | null {
  if (isV2Encrypted(stored)) return null;
  const plaintext = decryptCredential(stored);
  if (plaintext === stored) return null;
  return encryptCredential(plaintext);
}
