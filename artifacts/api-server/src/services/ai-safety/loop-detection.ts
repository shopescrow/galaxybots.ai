import crypto from "node:crypto";

export interface ToolCallSignature {
  hash: string;
  toolName: string;
}

export function hashToolCall(toolName: string, params: unknown): string {
  const raw = toolName + JSON.stringify(params);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function isDuplicateToolCall(
  hash: string,
  recentHashes: string[],
): boolean {
  return recentHashes.includes(hash);
}

export function computeTokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap++;
  }
  const maxSize = Math.max(tokensA.size, tokensB.size);
  return overlap / maxSize;
}

export function isStuckOutput(
  currentContent: string,
  previousResponses: string[],
  threshold = 0.9,
): boolean {
  for (const prev of previousResponses) {
    if (computeTokenOverlap(currentContent, prev) >= threshold) {
      return true;
    }
  }
  return false;
}

export const MAX_SESSION_DEPTH = 3;
export const MAX_WEBHOOK_DEPTH = 5;

export function checkSessionDepth(depth: number): { allowed: boolean; message?: string } {
  if (depth > MAX_SESSION_DEPTH) {
    return { allowed: false, message: "Maximum session nesting depth reached" };
  }
  return { allowed: true };
}
