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
    // silent — reporter must never crash the app
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
      sourcePayload: { message, source, lineno, colno },
    });
    if (originalOnError) return originalOnError.call(window, message, source, lineno, colno, error);
    return false;
  };

  const originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack ?? "" : "";
    postThreat({
      domain: "code",
      title: `Unhandled Promise Rejection: ${msg.slice(0, 200)}`,
      description: stack || msg,
      affectedComponent: "promise",
      severity: 65,
      sourcePayload: { reason: msg },
    });
    if (originalOnUnhandledRejection) originalOnUnhandledRejection.call(window, event);
  };
}

export function reportReactError(error: Error, componentName: string, route: string): void {
  postThreat({
    domain: "code",
    title: `React ErrorBoundary: ${error.message.slice(0, 200)}`,
    description: error.stack ?? error.message,
    affectedComponent: componentName,
    severity: 80,
    sourcePayload: { route, componentName, stack: error.stack },
  });
}
