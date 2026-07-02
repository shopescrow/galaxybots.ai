import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_RANGES: [number, number][] = [
  [0x00000000, 0x00ffffff],
  [0x0a000000, 0x0affffff],
  [0x7f000000, 0x7fffffff],
  [0xa9fe0000, 0xa9feffff],
  [0xac100000, 0xac1fffff],
  [0xc0000000, 0xc00000ff],
  [0xc0a80000, 0xc0a8ffff],
  [0xe0000000, 0xffffffff],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return PRIVATE_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

function isPrivateIpv6(ip: string): boolean {
  const expanded = ip.toLowerCase();
  return (
    expanded === "::1" ||
    expanded.startsWith("fc") ||
    expanded.startsWith("fd") ||
    expanded.startsWith("fe80") ||
    expanded.startsWith("::")
  );
}

/**
 * A fetch wrapper that refuses to follow any HTTP redirect.
 * This prevents SSRF via open-redirect chains: the initial URL is already
 * validated by assertSafeUrl(), and a redirect to an internal address would
 * otherwise bypass that check.  Callers that need the response body should
 * use this instead of the global fetch().
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, redirect: "error" });
}

export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error("Invalid URL"), { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("Only http and https URLs are permitted"), { status: 400 });
  }

  const hostname = parsed.hostname;

  if (net.isIPv4(hostname)) {
    if (isPrivateIpv4(hostname)) {
      throw Object.assign(new Error("Requests to private or reserved addresses are not permitted"), { status: 400 });
    }
    return;
  }

  if (net.isIPv6(hostname)) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIpv6(bare)) {
      throw Object.assign(new Error("Requests to private or reserved addresses are not permitted"), { status: 400 });
    }
    return;
  }

  const BLOCKED_HOSTNAMES = new Set([
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",
  ]);
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw Object.assign(new Error("Requests to private or reserved addresses are not permitted"), { status: 400 });
  }

  let addresses: string[];
  try {
    const v4: string[] = await dns.resolve4(hostname).catch(() => []);
    const v6: string[] = await dns.resolve6(hostname).catch(() => []);
    addresses = [...v4, ...v6];
  } catch {
    addresses = [];
  }

  for (const addr of addresses) {
    if (net.isIPv4(addr) && isPrivateIpv4(addr)) {
      throw Object.assign(new Error("Requests to private or reserved addresses are not permitted"), { status: 400 });
    }
    if (net.isIPv6(addr) && isPrivateIpv6(addr)) {
      throw Object.assign(new Error("Requests to private or reserved addresses are not permitted"), { status: 400 });
    }
  }
}
