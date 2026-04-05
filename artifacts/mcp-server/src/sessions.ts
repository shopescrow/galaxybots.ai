import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { AuthResult } from "./auth.js";

export interface ActiveSession {
  sessionId: string;
  clientName: string;
  connectedAt: Date;
  toolCallCount: number;
  callerType: "galaxybots" | "piratemonster" | "oauth";
  oauthClientId?: string;
  partnerKeyId: number | null;
}

export const transports = new Map<string, SSEServerTransport>();
export const activeSessions = new Map<string, ActiveSession>();
export const sessionAuthMap = new Map<string, AuthResult>();
export const trialCallsMap = new Map<string, number>();

export const TRIAL_MAX_CALLS = 3;
export const SERVER_START_TIME = Date.now();

let _totalToolCallsServed = 0;

export function getTotalToolCallsServed(): number {
  return _totalToolCallsServed;
}

export function incrementToolCallsServed(): void {
  _totalToolCallsServed++;
}

export function cleanupSession(sessionId: string): void {
  const transport = transports.get(sessionId);
  if (transport) {
    try { (transport as unknown as { close?: () => void }).close?.(); } catch { }
    transports.delete(sessionId);
  }
  sessionAuthMap.delete(sessionId);
  activeSessions.delete(sessionId);
  trialCallsMap.delete(sessionId);
}
