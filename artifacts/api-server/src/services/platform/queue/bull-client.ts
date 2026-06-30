/**
 * BullMQ connection factory.
 *
 * Returns the ConnectionOptions for BullMQ when REDIS_URL is configured.
 * When Redis is absent (local dev / single-instance) this returns null and
 * callers must fall back to in-process scheduling.
 */

import type { ConnectionOptions } from "bullmq";

export function getBullConnection(): ConnectionOptions | null {
  const url = process.env["REDIS_URL"];
  if (!url) return null;
  return { url };
}

export function isBullAvailable(): boolean {
  return !!process.env["REDIS_URL"];
}
