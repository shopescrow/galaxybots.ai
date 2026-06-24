import { Router } from "express";
import { getToolManifest } from "../tools/index.js";

export function buildLandingRoute(basePath: string): Router {
  const router = Router();

  router.get(`${basePath}`, (_req, res) => {
    const origin = `${_req.protocol}://${_req.get("host")}`;
    interface EndpointDef {
      label: string;
      path: string;
      method: string;
      purpose: string;
      params: string[];
      returns: string;
      access: string;
      useWhen: string;
      noLink?: boolean;
      group: string;
    }
    const endpoints: EndpointDef[] = [
      {
        label: "SSE Stream", method: "GET", path: `${basePath}/sse`, group: "Core MCP",
        purpose: "Opens a persistent Server-Sent Events connection that establishes a live MCP session. The server pushes protocol messages, tool results, and streaming progress over this connection.",
        params: ["Authorization: Bearer <key> (optional — omit for trial mode, 3 free calls)", "No query parameters required; session ID is assigned automatically on connect"],
        returns: "text/event-stream — continuous MCP protocol event frames including endpoint announcements, tool responses, and streaming tokens",
        access: "Public (trial) or Bearer token / OAuth 2.0",
        useWhen: "Connecting Claude Desktop, Cursor, or any MCP-compatible AI client to GalaxyBots directors",
      },
      {
        label: "Messages", method: "POST", path: `${basePath}/messages`, group: "Core MCP",
        purpose: "Delivers a JSON-RPC tool-call message to an active SSE session. The AI client sends tool invocations here; responses flow back over the SSE stream. Must be paired with an open /sse connection.",
        params: ["?sessionId=<uuid> (required) — the session ID received from the SSE endpoint announcement", "Body: JSON-RPC 2.0 object with method, params, and id fields", "Authorization: Bearer <key> (must match the key used to open the SSE session)"],
        returns: "HTTP 202 Accepted — the actual tool result arrives asynchronously over the SSE stream",
        access: "Same token as the SSE session (token mismatch returns 403)",
        useWhen: "Used automatically by MCP clients (Claude, Cursor) — not called directly by humans",
        noLink: true,
      },
      {
        label: "Tool Manifest", method: "GET", path: `${basePath}/tools`, group: "Discovery",
        purpose: "Returns the full list of MCP tools available on this server, with name, description, and JSON Schema for each tool's input parameters. Supports keyword search and department filtering. Paginated.",
        params: ["?q=<string> — full-text search across tool names and descriptions (e.g. ?q=memory)", "?department=<name> — filter by department: bots, aeo, finance, knowledge, gtm, admin, search", "?page=<n> — page number (default 1)", "?limit=<n> — results per page (default 100, max 100)"],
        returns: "JSON with tools[], total count, page info, available departments, and auth metadata",
        access: "Public — no authentication required",
        useWhen: "Building integrations, generating SDKs, building a tool picker UI, or discovering what's available before connecting",
      },
      {
        label: "Capabilities", method: "GET", path: `${basePath}/capabilities`, group: "Discovery",
        purpose: "Returns exactly what the calling token is permitted to do — which tools are accessible, what OAuth scopes are active, the rate limit, caller type, and partner key ID. Use this to validate a key before making tool calls.",
        params: ["Authorization: Bearer <key> (required)"],
        returns: "JSON with caller_type, access_level, rate_limit, allowed_tools[], allowed_tool_count, total_tools, scopes, partner_key_id, oauth_client_id",
        access: "Any valid Bearer token or OAuth 2.0 access token",
        useWhen: "Onboarding a new API key, debugging a 403 error, or building a capabilities display in a partner dashboard",
        noLink: true,
      },
      {
        label: "Health Check", method: "GET", path: `${basePath}/health`, group: "Observability",
        purpose: "Live server health check. Performs a real database round-trip (SELECT 1) and returns runtime telemetry. Returns status 'ok' when all systems are healthy, 'degraded' if the database is unreachable.",
        params: ["No parameters required"],
        returns: "JSON with status, service, version, uptime (formatted + ms), active_sessions, tool_calls_served (this boot), database status, and ISO timestamp",
        access: "Public — no authentication required",
        useWhen: "Monitoring integrations, uptime checks, CI/CD readiness gates, or load balancer health probes",
      },
      {
        label: "Active Sessions", method: "GET", path: `${basePath}/sessions`, group: "Observability",
        purpose: "Returns a real-time list of all currently connected SSE sessions — who is connected, when they connected, how many tool calls they have made, and whether they authenticated via bearer token or OAuth.",
        params: ["Authorization: Bearer <admin-key> (required — MCP_API_KEY environment variable)"],
        returns: "JSON with sessions[] (sessionId, clientName, connectedAt, toolCallCount, callerType, partnerKeyId) and total count",
        access: "Admin only — requires the internal MCP_API_KEY",
        useWhen: "Auditing active connections, diagnosing stuck sessions, or monitoring concurrent partner usage",
        noLink: true,
      },
      {
        label: "Terminate Session", method: "DELETE", path: `${basePath}/sessions/{sessionId}`, group: "Observability",
        purpose: "Forcibly closes an active SSE session by ID. Removes the session from all internal maps, terminates the SSE transport, and logs the admin action. The client will receive a connection close event.",
        params: ["Path: {sessionId} — the UUID of the session to terminate (from GET /sessions)", "Authorization: Bearer <admin-key> (required)"],
        returns: "JSON with terminated: true and the sessionId that was closed",
        access: "Admin only — requires the internal MCP_API_KEY",
        useWhen: "Removing a misbehaving or unauthorized client, releasing a hung session, or enforcing a key revocation immediately",
        noLink: true,
      },
      {
        label: "OpenAPI 3.1 Spec", method: "GET", path: `${basePath}/openapi.json`, group: "Discovery",
        purpose: "Returns the complete OpenAPI 3.1 specification for this server — all endpoints, every MCP tool as a POST operation, full security scheme definitions (Bearer + OAuth2 PKCE), request/response schemas, and tagged groupings.",
        params: ["No parameters required"],
        returns: "JSON — OpenAPI 3.1.0 document with info, servers, security, components, and paths for all endpoints plus one path per tool",
        access: "Public — no authentication required",
        useWhen: "Importing into Postman or Insomnia, generating a typed SDK, feeding a developer portal, or building API documentation",
      },
      {
        label: "OAuth Authorize", method: "GET", path: `${basePath}/oauth/authorize`, group: "OAuth 2.0",
        purpose: "Step 1 of the OAuth 2.0 PKCE flow. Presents an authorization UI where the developer authenticates with their GalaxyBots Developer API key, reviews the requested scopes, and approves or denies the client application's access request.",
        params: ["?client_id=<string> (required) — registered OAuth client ID", "?redirect_uri=<url> (required) — must match the registered redirect URI", "?response_type=code (required)", "?code_challenge=<base64url> (required) — S256 PKCE challenge", "?code_challenge_method=S256 (recommended)", "?scope=<space-delimited> — e.g. bots:read bots:write aeo:read", "?state=<string> (recommended) — CSRF protection token"],
        returns: "HTML authorization page, then HTTP 302 redirect to redirect_uri with ?code= and ?state=",
        access: "Public — no authentication header required (developer authenticates via the UI)",
        useWhen: "Building a third-party integration that needs user-authorized access to GalaxyBots on behalf of a client",
      },
      {
        label: "OAuth Token", method: "POST", path: `${basePath}/oauth/token`, group: "OAuth 2.0",
        purpose: "Step 2 of the OAuth 2.0 PKCE flow. Exchanges an authorization code for an access token and refresh token. Also handles grant_type=refresh_token to issue new tokens when the access token expires (1 hour TTL).",
        params: ["Body (JSON or form-encoded): grant_type (authorization_code or refresh_token), code, redirect_uri, code_verifier, client_id, refresh_token (for refresh grant)"],
        returns: "JSON with access_token (RS256 JWT), token_type, expires_in (3600s), refresh_token, scope",
        access: "Public — no Authorization header (PKCE code_verifier serves as proof of possession)",
        useWhen: "After the user approves access in /oauth/authorize, exchange the code for tokens that can be used as Bearer tokens on /sse and /messages",
        noLink: true,
      },
      {
        label: "OAuth Revoke", method: "POST", path: `${basePath}/oauth/revoke`, group: "OAuth 2.0",
        purpose: "Immediately invalidates an access token or refresh token (RFC 7009). The token is marked revoked in the database; subsequent uses are rejected even if the JWT signature is still cryptographically valid.",
        params: ["Body (JSON or form-encoded): token (required) — the access or refresh token to revoke", "token_type_hint: access_token or refresh_token (optional, helps route the lookup)"],
        returns: "JSON with revoked: true (always returns 200 even if token was not found — per RFC 7009)",
        access: "Public — no Authorization header required",
        useWhen: "Logging a user out, responding to a key compromise, rotating tokens, or cleaning up after a session ends",
        noLink: true,
      },
      {
        label: "OAuth JWKS", method: "GET", path: `${basePath}/oauth/jwks`, group: "OAuth 2.0",
        purpose: "Returns the JSON Web Key Set containing the server's RSA public key used to sign all access tokens. Partners can fetch this to verify token signatures locally without contacting GalaxyBots — standard RS256 verification.",
        params: ["No parameters required"],
        returns: "JSON with keys[] — each key includes the RSA public key in JWK format (kty, n, e), kid (key ID), use: sig, alg: RS256",
        access: "Public — no authentication required",
        useWhen: "Setting up a resource server that validates GalaxyBots access tokens independently, or configuring a JWT middleware library",
      },
      {
        label: "MCP Discovery", method: "GET", path: `/.well-known/mcp.json`, group: "Discovery",
        purpose: "Standard MCP well-known discovery document. AI clients and MCP hosts query this URL to auto-discover the server's endpoint URLs, available tools, supported auth methods, trial configuration, and protocol version — without any prior configuration.",
        params: ["No parameters required — must be accessible at the domain root (not under /__mcp/)"],
        returns: "JSON with name, description, mcp_version, endpoints (sse, messages, health, oauth), tools_preview[], auth_methods[], scopes[], trial config",
        access: "Public — no authentication required",
        useWhen: "Auto-configuring an MCP client, building an MCP registry listing, or setting up Claude Desktop with just the domain URL",
      },
      {
        label: "Analyze PDF", method: "TOOL", path: `${basePath}/messages`, group: "PDF Intelligence",
        noLink: true,
        purpose: "Analyze a PDF document from a public URL using GalaxyBots AI intelligence. Returns document type classification, a 2-4 sentence summary, key insights, action items, extracted entities (people, organizations, dates, amounts, locations), compliance risk flags, sentiment, and a recommended GalaxyBots director to own the document.",
        params: ["url (string, required) — Public HTTPS URL of the PDF to analyze", "depth ('standard' | 'deep', optional, default: 'standard') — standard uses gpt-5-mini for speed; deep uses gpt-4o for thorough analysis of complex documents"],
        returns: "JSON with documentType, title, summary, keyInsights[], actionItems[], entities{people,organizations,dates,amounts,locations}, riskFlags[], sentiment, confidenceScore, metadata{numPages,characterCount}, directorRouting{director,department,reason}, analyzedAt",
        access: "Bearer token or OAuth 2.0 — any authenticated GalaxyBots user",
        useWhen: "A client shares a document that needs intelligent review — contract, invoice, report, or any file requiring executive attention",
      },
      {
        label: "Extract PDF Data", method: "TOOL", path: `${basePath}/messages`, group: "PDF Intelligence",
        noLink: true,
        purpose: "Extract specific structured fields from any PDF document using AI. You define the schema — field names and type hints — and the tool returns extracted values with per-field confidence scores. Eliminates manual data entry for invoices, contracts, purchase orders, and forms.",
        params: ["url (string, required) — Public HTTPS URL of the PDF", "schema (object, required) — Fields to extract with type hints, e.g. {\"invoice_number\":\"string\",\"total_amount\":\"number\"}"],
        returns: "JSON with extractedFields (each with value, type, confidence), documentMetadata, extractedAt",
        access: "Bearer token or OAuth 2.0 — any authenticated GalaxyBots user",
        useWhen: "Automating data entry from structured documents like invoices, purchase orders, or contracts",
      },
      {
        label: "Classify PDF", method: "TOOL", path: `${basePath}/messages`, group: "PDF Intelligence",
        noLink: true,
        purpose: "Quickly classify a PDF by type and get routing recommendation without full analysis. Much faster than analyze_pdf — use when you only need to know what kind of document it is and which AI Director should handle it.",
        params: ["url (string, required) — Public HTTPS URL of the PDF"],
        returns: "JSON with documentType, confidence, title, directorRouting{director,department,reason}, classifiedAt",
        access: "Bearer token or OAuth 2.0 — any authenticated GalaxyBots user",
        useWhen: "Sorting incoming documents into categories before deciding which need deep analysis",
      },
      {
        label: "Batch Analyze PDFs", method: "TOOL", path: `${basePath}/messages`, group: "PDF Intelligence",
        noLink: true,
        purpose: "Analyze up to 20 PDF documents in parallel. Each document is classified, summarized, and intelligence-extracted simultaneously. Returns individual results for each document with success/error status.",
        params: ["urls (string[], required) — Array of public HTTPS PDF URLs (max 20)", "depth ('standard' | 'deep', optional) — Analysis depth for all documents"],
        returns: "JSON with results[] (each containing full analysis or error), summary{total,successful,failed}, batchId, analyzedAt",
        access: "Bearer token or OAuth 2.0 — any authenticated GalaxyBots user",
        useWhen: "Processing a batch of documents at once — e.g., analyzing all contracts in a deal room or classifying a folder of invoices",
      },
    ];

    const groups = [...new Set(endpoints.map(e => e.group))];
    const endpointRows = groups.map(group => {
      const items = endpoints.filter(e => e.group === group);
      const cards = items.map(e => {
        const tag = e.noLink ? "div" : "a";
        const href = e.noLink ? "" : `href="${origin}${e.path}" target="_blank"`;
        const paramRows = e.params.map(p => {
          const parts = p.split(" — ");
          return `<li>${parts.length > 1 ? `<code>${parts[0]}</code> <span>— ${parts.slice(1).join(" — ")}</span>` : p}</li>`;
        }).join("");
        return `
      <${tag} ${href} class="ep-card${e.noLink ? " ep-no-link" : ""}">
        <div class="ep-header">
          <span class="method method-${e.method.toLowerCase()}">${e.method}</span>
          <code class="ep-path">${e.path}</code>
          <span class="ep-label">${e.label}</span>
          ${e.noLink ? '<span class="ep-no-browser">Browser n/a</span>' : ""}
        </div>
        <p class="ep-purpose">${e.purpose}</p>
        <div class="ep-meta">
          <div class="ep-meta-row">
            <div class="ep-meta-block">
              <span class="ep-meta-label">Parameters</span>
              <ul class="ep-params">${paramRows}</ul>
            </div>
            <div class="ep-meta-block">
              <span class="ep-meta-label">Returns</span>
              <p class="ep-returns">${e.returns}</p>
              <span class="ep-meta-label" style="margin-top:10px">Access</span>
              <p class="ep-access">${e.access}</p>
              <span class="ep-meta-label" style="margin-top:10px">Use when</span>
              <p class="ep-use-when">${e.useWhen}</p>
            </div>
          </div>
        </div>
      </${tag}>`;
      }).join("");
      return `<div class="ep-group">
      <p class="ep-group-label">${group}</p>
      ${cards}
    </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GalaxyBots MCP Server</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:       #070A14;
      --surface:  #0D1126;
      --surface2: #121930;
      --border:   #1D2B4A;
      --text:     #EEF2FF;
      --muted:    #8FA3C0;
      --faint:    #5A7490;
      --purple:   #9B5CF6;
      --cyan:     #06D4EF;
      --green:    #10B981;
      --amber:    #F5B800;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      background-image:
        radial-gradient(circle at 15% 50%, rgba(155, 92, 246, 0.06), transparent 30%),
        radial-gradient(circle at 85% 20%, rgba(6, 212, 239, 0.06), transparent 30%);
    }
    a { color: inherit; text-decoration: none; }
    .header {
      border-bottom: 1px solid var(--border);
      padding: 28px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .logo-row { display: flex; align-items: center; gap: 16px; }
    .logo-img { width: 52px; height: 52px; object-fit: contain; }
    .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    .brand span { background: linear-gradient(90deg, var(--purple), var(--cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .version-badge {
      font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
      background: var(--surface2); border: 1px solid var(--border);
      color: var(--muted); padding: 3px 10px; border-radius: 20px;
    }
    .status-pill {
      display: flex; align-items: center; gap: 6px;
      background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--green); font-size: 12px; font-weight: 600;
      padding: 5px 14px; border-radius: 20px;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .main { max-width: 1020px; margin: 0 auto; padding: 48px 24px; }
    .hero { text-align: center; margin-bottom: 52px; }
    .hero-logo { width: 100px; height: 100px; object-fit: contain; margin-bottom: 20px; }
    .hero h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 10px; }
    .hero h1 span { background: linear-gradient(90deg, var(--purple), var(--cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 15px; color: var(--muted); line-height: 1.6; max-width: 560px; margin: 0 auto 28px; }
    .hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 10px 22px; border-radius: 10px; font-size: 14px; font-weight: 600;
      transition: opacity .15s, transform .15s;
    }
    .btn:hover { opacity: .85; transform: translateY(-1px); }
    .btn-primary { background: linear-gradient(135deg, var(--purple), #7C3AED); color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--muted); }
    .btn-outline:hover { border-color: var(--purple); color: var(--text); }
    .section { margin-bottom: 44px; }
    .section-title {
      font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
      color: var(--faint); margin-bottom: 14px;
    }
    .method {
      font-size: 10px; font-weight: 700; letter-spacing: .6px;
      padding: 3px 8px; border-radius: 5px; text-align: center; white-space: nowrap; flex-shrink: 0;
    }
    .method-get    { color: var(--cyan);  background: rgba(6,212,239,.12);  border: 1px solid rgba(6,212,239,.25); }
    .method-post   { color: var(--amber); background: rgba(245,184,0,.12);  border: 1px solid rgba(245,184,0,.25); }
    .method-delete { color: #F87171;      background: rgba(248,113,113,.12); border: 1px solid rgba(248,113,113,.25); }
    .method-tool   { color: var(--green); background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.25); }
    .ep-group { margin-bottom: 36px; }
    .ep-group-label {
      font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase;
      color: var(--faint); margin-bottom: 12px; padding-left: 2px;
    }
    .ep-card {
      display: block;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 20px 22px; margin-bottom: 10px;
      transition: border-color .18s, background .18s;
      text-decoration: none; color: inherit;
    }
    a.ep-card:hover { border-color: var(--purple); background: var(--surface2); cursor: pointer; }
    .ep-no-link { cursor: default; opacity: .95; }
    .ep-header {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .ep-path {
      font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 13px; color: var(--text); background: none; border: none;
    }
    .ep-label {
      font-size: 13px; font-weight: 600; color: var(--muted);
    }
    .ep-no-browser {
      font-size: 10px; font-weight: 600; color: var(--faint);
      background: var(--surface2); border: 1px solid var(--border);
      padding: 2px 8px; border-radius: 20px; margin-left: auto;
    }
    .ep-purpose {
      font-size: 13px; color: var(--muted); line-height: 1.65;
      margin-bottom: 14px; padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .ep-meta-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }
    .ep-meta-block {}
    .ep-meta-label {
      display: block;
      font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      color: var(--faint); margin-bottom: 6px;
    }
    .ep-params {
      list-style: none; margin-bottom: 0;
    }
    .ep-params li {
      font-size: 12px; color: var(--muted); line-height: 1.55;
      padding: 3px 0; border-bottom: 1px solid rgba(29,43,74,.5);
    }
    .ep-params li:last-child { border-bottom: none; }
    .ep-params code {
      font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 11px; color: var(--cyan); background: rgba(6,212,239,.08);
      padding: 1px 5px; border-radius: 4px;
    }
    .ep-params span { color: var(--faint); }
    .ep-returns, .ep-access, .ep-use-when {
      font-size: 12px; color: var(--muted); line-height: 1.55;
    }
    .ep-use-when { color: var(--text); font-style: italic; }
    @media (max-width: 640px) {
      .ep-meta-row { grid-template-columns: 1fr; }
      .ep-no-browser { display: none; }
    }
    .auth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .auth-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 16px 18px;
    }
    .auth-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--purple); }
    .auth-card p  { font-size: 12px; color: var(--muted); line-height: 1.5; }
    .code-block {
      background: #06090F; border: 1px solid var(--border);
      border-radius: 12px; padding: 18px 20px;
      font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 12px; line-height: 1.7; overflow-x: auto;
    }
    .c-comment { color: #5A7490; }
    .c-key     { color: #9B5CF6; }
    .c-str     { color: #06D4EF; }
    .c-val     { color: #F5B800; }
    .footer {
      border-top: 1px solid var(--border); padding: 20px 40px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; color: var(--faint); flex-wrap: wrap; gap: 10px;
    }
    .footer a { color: var(--muted); }
    .footer a:hover { color: var(--purple); }
    .footer-links { display: flex; gap: 18px; }
    @media (max-width: 600px) {
      .header { padding: 16px 20px; }
      .main   { padding: 32px 16px; }
      .auth-grid { grid-template-columns: 1fr; }
      .hero h1 { font-size: 24px; }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="logo-row">
      <img src="https://galaxybots.ai/favicon.png" alt="GalaxyBots" class="logo-img" onerror="this.style.display='none'" />
      <span class="brand"><span>GalaxyBots</span> MCP</span>
      <span class="version-badge">v2025-03</span>
    </div>
    <div class="status-pill"><span class="dot"></span> Online</div>
  </header>

  <main class="main">

    <div class="hero">
      <img src="https://galaxybots.ai/favicon.png" alt="GalaxyBots" class="hero-logo" onerror="this.style.display='none'" />
      <h1>Your AI Executive Team,<br /><span>via MCP</span></h1>
      <p>The GalaxyBots Model Context Protocol server gives Claude, Claude Desktop, and any MCP-compatible client direct access to 51 AI executive directors — from CEO to CISO.</p>
      <div class="hero-actions">
        <a href="https://galaxybots.ai" class="btn btn-primary" target="_blank">Get API Access</a>
        <a href="${origin}${basePath}/tools" class="btn btn-outline" target="_blank">Browse Tools</a>
        <a href="${origin}${basePath}/health" class="btn btn-outline" target="_blank">Health Check</a>
      </div>
    </div>

    <div class="section">
      <p class="section-title">API Reference — ${endpoints.length} Endpoints across ${groups.length} groups</p>
      ${endpointRows}
    </div>

    <div class="section">
      <p class="section-title">Authentication</p>
      <div class="auth-grid">
        <div class="auth-card">
          <h3>Bearer Token</h3>
          <p>Pass your API key in the <code>Authorization</code> header.<br /><code>Authorization: Bearer &lt;YOUR_KEY&gt;</code></p>
        </div>
        <div class="auth-card">
          <h3>OAuth 2.0 PKCE</h3>
          <p>Full OAuth flow for partner integrations. Begin at <code>${basePath}/oauth/authorize</code> with your client credentials.</p>
        </div>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Claude Desktop Quick-Start</p>
      <div class="code-block">
<span class="c-comment">// Add to your claude_desktop_config.json</span>
{
  <span class="c-key">"mcpServers"</span>: {
    <span class="c-key">"galaxybots"</span>: {
      <span class="c-key">"url"</span>: <span class="c-str">"${origin}${basePath}/sse"</span>,
      <span class="c-key">"apiKey"</span>: <span class="c-str">"YOUR_GALAXYBOTS_API_KEY"</span>
    }
  }
}
      </div>
    </div>

  </main>

  <footer class="footer">
    <span>&copy; ${new Date().getFullYear()} GalaxyBots.ai — AI Executive Intelligence</span>
    <div class="footer-links">
      <a href="https://galaxybots.ai" target="_blank">Website</a>
      <a href="https://galaxybots.ai/mcp-docs" target="_blank">Docs</a>
      <a href="${origin}/.well-known/mcp.json" target="_blank">Discovery JSON</a>
    </div>
  </footer>

</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  return router;
}
