import crypto from "crypto";

let ACTION_LINK_SECRET: string;

function getSecret(): string {
  if (!ACTION_LINK_SECRET) {
    ACTION_LINK_SECRET = process.env.APPROVAL_LINK_SECRET ?? crypto.randomBytes(32).toString("hex");
    if (!process.env.APPROVAL_LINK_SECRET) {
      console.error(
        "[governance] CRITICAL: APPROVAL_LINK_SECRET env var is not set. " +
        "One-click approval tokens will be invalidated on every server restart. " +
        "Set APPROVAL_LINK_SECRET to a stable secret in production."
      );
    }
  }
  return ACTION_LINK_SECRET;
}

export function signApprovalToken(payload: { id: number; action: "approve" | "reject"; exp: number }): string {
  const secret = getSecret();
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

export function verifyApprovalToken(token: string): { id: number; action: "approve" | "reject"; exp: number } | null {
  try {
    const secret = getSecret();
    const [dataB64, sig] = token.split(".");
    if (!dataB64 || !sig) return null;
    const data = Buffer.from(dataB64, "base64url").toString();
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const parsed = JSON.parse(data) as { id: number; action: "approve" | "reject"; exp: number };
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
