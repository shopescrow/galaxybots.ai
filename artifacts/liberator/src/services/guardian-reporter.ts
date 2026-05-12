const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const GUARDIAN_ENDPOINT = `${BASE}/api/v1/guardian/report`;

const SESSION_SEEN = new Set<string>();

function fingerprint(domain: string, msg: string, source: string): string {
  return `${domain}:${msg.slice(0, 80)}:${source}`;
}

async function postThreat(payload: {
  domain: string;
  title: string;
  description: string;
  affectedComponent?: string;
  severity?: number;
  sourcePayload?: unknown;
}): Promise<void> {
  const fp = fingerprint(payload.domain, payload.title, payload.affectedComponent ?? "");
  if (SESSION_SEEN.has(fp)) return;
  SESSION_SEEN.add(fp);

  try {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(GUARDIAN_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // silent
  }
}

export function installGlobalErrorReporter(): void {
  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    postThreat({
      domain: "code",
      title: String(message).slice(0, 200),
      description: error?.stack ?? `${message} at ${source}:${lineno}:${colno}`,
      affectedComponent: source ?? "window",
      severity: 75,
      sourcePayload: { message, source, lineno, colno, app: "liberator" },
    });
    if (originalOnError) return originalOnError.call(window, message, source, lineno, colno, error);
    return false;
  };

  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    postThreat({
      domain: "code",
      title: `Liberator Unhandled Rejection: ${msg.slice(0, 200)}`,
      description: msg,
      affectedComponent: "promise",
      severity: 65,
      sourcePayload: { reason: msg, app: "liberator" },
    });
  };
}

export function reportReactError(error: Error, componentName: string): void {
  postThreat({
    domain: "code",
    title: `Liberator React Error: ${error.message.slice(0, 200)}`,
    description: error.stack ?? error.message,
    affectedComponent: componentName,
    severity: 80,
    sourcePayload: { componentName, app: "liberator", stack: error.stack },
  });
}
